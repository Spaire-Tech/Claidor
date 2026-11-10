import Foundation

/**
 * API keys (10 November 2026, the founder: "Below subscription something
 * called api keys"): the providers a person brings their own key for, as
 * Simeon Labs' server lists them (`keyProviders` of `models/accounts`, in
 * the founder's order, with each provider's key page and the details it
 * needs), and their words in the apps. The person pastes the key; the
 * server tries it at the provider and keeps it sealed, never the app
 * (server/simeon/desktop/key_providers.py; docs/your-own-models.md, section
 * 7). Shared by the Mac and the iPhone, and translated in the web app's
 * core (clients/apps/app/src/core/aiModels.ts).
 */

/** One detail a provider needs besides the key (Azure's endpoint, Cloudflare's account), as the server names it. */
public struct KeyField: Identifiable, Equatable, Sendable {
  public let key: String
  public let placeholder: String
  /** What it holds until the person types otherwise (Bedrock's region). */
  public let defaultValue: String?
  public var id: String { key }

  public init(key: String, placeholder: String, defaultValue: String? = nil) {
    self.key = key; self.placeholder = placeholder; self.defaultValue = defaultValue
  }

  public init?(json: JSON) {
    guard let key = json["key"]?.text else { return nil }
    self.init(key: key, placeholder: json["placeholder"]?.text ?? "", defaultValue: json["default"]?.text)
  }

  /** Its name over its field. */
  public var name: String { AIModels.keyFieldName(key) }
  /** Its line under its field, where it needs one. */
  public var note: String? { AIModels.keyFieldNote(key) }
}

/** A provider a person brings their own API key for, as the server lists it. */
public struct KeyProvider: Identifiable, Equatable, Sendable {
  public let provider: String
  public let name: String
  /** Where the person makes a key: the provider's own page, over https. */
  public let keyPage: URL?
  /** False: listed, "Soon" (GitHub Copilot, Meta). */
  public let available: Bool
  public let fields: [KeyField]
  public var id: String { provider }

  public init(provider: String, name: String, keyPage: URL?, available: Bool = true, fields: [KeyField] = []) {
    self.provider = provider; self.name = name; self.keyPage = keyPage
    self.available = available; self.fields = fields
  }

  public init?(json: JSON) {
    guard let provider = json["provider"]?.text,
          provider.range(of: "^[a-z0-9]{1,20}$", options: .regularExpression) != nil
    else { return nil }
    // Only the provider's own page over https is ever opened.
    let page = json["keyPage"]?.text.flatMap(URL.init(string:))
    self.init(
      provider: provider,
      name: json["name"]?.text ?? AIModels.providerName(provider),
      keyPage: page?.scheme == "https" ? page : nil,
      available: json["available"]?.bool ?? true,
      fields: (json["fields"]?.array ?? []).compactMap(KeyField.init(json:))
    )
  }

  /** The line under its name, for a person who has its plan rather than a key. */
  public var hint: String? { AIModels.keyHint(provider) }
}

/** How a key went. */
public enum KeyConnect: Equatable, Sendable {
  case connected(ModelAccount)
  /** The key wasn't kept: why, in the person's words. */
  case refused(String)
}

extension AIModels {
  /** The providers of the person's own API keys, as people know them, by the server's slug (`key_providers.PROVIDERS`). The list itself, its order and pages, is the server's. */
  public static let keyProviderNames: [String: String] = [
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "xai": "SpaceXAI",
    "google": "Google",
    "bedrock": "Amazon Bedrock",
    "antling": "Ant Ling",
    "azure": "Azure OpenAI",
    "baseten": "Baseten",
    "cerebras": "Cerebras",
    "cloudflare": "Cloudflare Workers AI",
    "deepseek": "DeepSeek",
    "fireworks": "Fireworks",
    "copilot": "GitHub Copilot",
    "groq": "Groq",
    "huggingface": "Hugging Face",
    "meta": "Meta",
    "minimax": "MiniMax",
    "mistral": "Mistral",
    "moonshot": "Moonshot AI",
    "nvidia": "NVIDIA",
    "opencode": "OpenCode Go",
    "qwen": "Qwen",
    "together": "Together",
    "xiaomi": "Xiaomi",
    "zai": "Z.AI",
  ]

  /** The line under a provider's name for a person who has its plan rather than a key: connect the plan instead (the founder's "SuperGrok or X Premium+? Connect Grok under Subscriptions."). */
  public static func keyHint(_ provider: String) -> String? {
    switch provider {
    case "xai": return L10n.text("SuperGrok or X Premium+? Connect Grok under Subscriptions.")
    case "anthropic": return L10n.text("Claude Pro or Max? Connect Claude under Subscriptions.")
    case "openai": return L10n.text("ChatGPT Plus or Pro? Connect ChatGPT under Subscriptions.")
    default: return nil
    }
  }

  /** A detail's name over its field. */
  public static func keyFieldName(_ key: String) -> String {
    switch key {
    case "endpoint": return L10n.text("Endpoint")
    case "deployments": return L10n.text("Deployments")
    case "account_id": return L10n.text("Account ID")
    case "region": return L10n.text("Region")
    default: return key
    }
  }

  /** A detail's line under its field, where it needs one. */
  public static func keyFieldNote(_ key: String) -> String? {
    key == "deployments" ? L10n.text("Your deployments' names, separated by commas.") : nil
  }

  /** Why a key wasn't connected, in the person's words (`error.code` of `models/accounts/keys/<provider>`). */
  public static func keyProblem(code: String?, name: String) -> String {
    switch code {
    case "invalid_key": return L10n.text("That doesn't look like a \(name) key. Paste it again.")
    case "invalid_fields": return L10n.text("Check the details \(name) needs.")
    case "key_refused": return L10n.text("\(name) didn't accept this key. Check it and try again.")
    case "provider_unavailable": return L10n.text("Couldn't reach \(name). Try again in a moment.")
    case "unknown_provider": return L10n.text("\(name) can't be connected yet.")
    default: return L10n.text("Couldn't connect \(name). Try again.")
    }
  }
}
