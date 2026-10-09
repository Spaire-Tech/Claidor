import Foundation

/**
 * What the person reads before an app's sign-in page opens (the founder,
 * 9 October 2026: "when you click on add … before you go to the link to
 * connect"): the app, what the agents will be able to reach in it, that
 * the person stays in charge, that agents can get things wrong, who handles
 * the sign-in (Composio for the apps it serves, the app itself for the
 * rest), where the information goes, and, for some apps, one more thing
 * worth knowing about that app. One template; each app fills it a little
 * differently.
 */
public struct ConnectConsent: Identifiable, Equatable, Sendable {
  /** Who handles the sign-in and holds the access. */
  public enum Route: Equatable, Sendable {
    /** Composio, through Simeon's own server (`/desktop/api/apps/mcp/…`). */
    case composio
    /** The app's own server (`vendorMcpUrl`). */
    case vendor(host: String)
    /** Not in the catalog: the app's page, said plainly. */
    case unknown
  }

  public struct Point: Equatable, Sendable {
    /** An SF Symbol. */
    public let symbol: String
    public let title: String
    public let body: String
  }

  public let id: String
  public let title: String
  public let summary: String
  public let route: Route
  public let points: [Point]
  /** The small print under the points: sign-in, where the information goes, the app's own terms. */
  public let smallPrint: [String]
  /** One more thing about this app, when there is one (the founder's reference gives Shopify an extra paragraph). */
  public let note: String?

  public init(app: CatalogApp?, name: String) {
    let title = app?.title ?? name
    let key = app?.id ?? CatalogApp.slug(name)
    id = key
    self.title = title
    summary = app?.summary.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    route = Self.route(app)

    let reach: String
    if let custom = Self.reachSentence[key] { reach = custom.replacingOccurrences(of: "{App}", with: title) }
    else if let things = Self.reaches[key] { reach = "Your agents can \(Self.readOnly.contains(key) ? "read" : "read and use") \(things) in \(title)." }
    else { reach = "Your agents can read and use what's in your \(title) account." }

    points = [
      Point(symbol: "square.stack.3d.up", title: "Put \(title) to work", body: reach),
      Point(symbol: "hand.raised", title: "You stay in charge", body: "Auto-review asks for your OK before steps it judges risky. Turn off any of \(title)'s tools, or remove it, in Settings → Connect apps."),
      Point(symbol: "checkmark.circle", title: "Check their work", body: "Agents can misread a request or take a step you didn't expect. Look over what they do in \(title), especially at first."),
    ]

    let signIn: String
    switch route {
    case .composio:
      signIn = "Composio, the service Simeon uses to connect apps, handles the \(title) sign-in and holds its access. Simeon never sees your password."
    case .vendor(let host):
      signIn = "You'll sign in on \(title)'s own page, and \(title) runs this connection from its own server (\(host)). Simeon never sees your password."
    case .unknown:
      signIn = "You'll sign in on \(title)'s own page. Simeon never sees your password."
    }
    smallPrint = [
      signIn,
      "What your agents read in \(title) becomes part of your chats with them and is sent to the AI models that do the work.",
      "\(title)'s own terms and privacy policy apply to the information it shares with Simeon.",
    ]
    note = Self.notes[key] ?? (Self.money.contains(key) ? "Anything that moves money in \(title) is real. Ask your agents to check with you before they move any." : nil)
  }

  /** Composio when the catalog names its toolkit or the app is served from Simeon's own apps address; the app's server otherwise. */
  static func route(_ app: CatalogApp?) -> Route {
    guard let app else { return .unknown }
    if app.composioToolkit != nil { return .composio }
    guard let url = app.serverURL else { return .unknown }
    if url.contains("/desktop/api/apps/mcp/") { return .composio }
    guard let host = URL(string: url)?.host, !host.isEmpty else { return .unknown }
    return .vendor(host: host)
  }

  // MARK: Each app's part

  /** What the agents reach in each app, in Simeon's words. */
  static let reaches: [String: String] = [
    "gmail": "your emails, threads, labels and drafts",
    "outlook": "your email, folders and calendar",
    "google-calendar": "your calendars, events and invitations",
    "notion": "your pages and databases",
    "google-drive": "your files and folders, and who they're shared with",
    "dropbox": "your files and folders",
    "airtable": "your bases, tables and records",
    "asana": "your tasks, projects and comments",
    "clickup": "your tasks, docs and spaces",
    "monday": "your boards and items",
    "todoist": "your tasks and projects",
    "zoom": "your meetings, recordings, transcripts and Zoom Docs",
    "google-meet": "your meetings and recordings",
    "figma": "your files, frames and design details",
    "canva": "your designs and brand assets",
    "miro": "your boards and what's on them",
    "webflow": "your sites, CMS collections and items",
    "wix": "your sites and collections",
    "stripe": "customers, payments, subscriptions and invoices",
    "paypal": "invoices, orders and transactions",
    "square": "payments, your catalog and orders",
    "ramp": "expenses, cards, bills and reimbursements",
    "quickbooks": "your books, invoices, bills and expenses",
    "hubspot": "contacts, companies, deals and tickets",
    "salesforce": "leads, accounts, opportunities and cases",
    "intercom": "conversations, contacts and Help Center articles",
    "apollo": "people, accounts and sequences",
    "linear": "issues, projects and cycles",
    "jira": "Jira issues and Confluence pages",
    "github": "repositories, issues, pull requests and Actions",
    "vercel": "projects, deployments and logs",
    "supabase": "projects, tables and data",
    "sentry": "errors, releases and performance data",
    "cloudflare": "Workers, KV and their bindings",
    "mailchimp": "audiences, campaigns and automations",
    "greenhouse": "jobs, candidates and your pipeline",
    "gusto": "payroll, employees and time off",
    "slack": "channels, direct messages and the people in them",
    "google-docs": "your documents",
    "google-sheets": "your spreadsheets",
    "google-slides": "your presentations",
    "onedrive": "your files in Microsoft 365",
    "google-tasks": "your tasks and lists",
    "trello": "boards, lists and cards",
    "xero": "invoices, contacts, reports and payroll",
    "shopify": "products, orders, customers and your store's settings",
    "brex": "expenses, receipts, bills, cards and travel",
    "pipedrive": "deals, people and your pipeline",
    "docusign": "envelopes, templates and agreements",
    "klaviyo": "profiles, segments, campaigns and flows",
    "ashby": "candidates, interviews and pipeline tasks",
    "google-analytics": "traffic, conversions and GA4 reports",
    "google-search-console": "search queries, clicks and indexing",
    "youtube": "your channel's videos, playlists and stats",
    "kit": "subscribers, tags and broadcasts",
    "instagram": "posts, comments, messages and insights",
    "facebook": "your Pages' posts, comments, messages and insights",
    "calendly": "booking links, meetings and invitees",
    "cal-com": "bookings, event types and availability",
    "attio": "people, companies, deals and lists",
    "zendesk": "tickets, customers and your help center",
    "microsoft-teams": "chats, channels and meetings",
    "discord": "your servers, channels and invites",
    "mercury": "your accounts, balances and transactions",
    "posthog": "analytics, insights and feature flags",
    "google-ads": "campaigns, ad groups, keywords and results",
    "tiktok-ads": "campaigns, ads, audiences and reports",
  ]

  /** Apps the agents can only read (the catalog says so). */
  static let readOnly: Set<String> = ["mercury", "figma"]

  /** Apps whose reach is said another way. */
  static let reachSentence: [String: String] = [
    "linkedin": "Your agents can read your profile and publish posts on {App}.",
  ]

  /** Apps where money moves for real. */
  static let money: Set<String> = ["stripe", "paypal", "square", "ramp", "brex", "quickbooks", "xero", "gusto"]

  /** One more thing worth knowing about an app. */
  static let notes: [String: String] = [
    "shopify": "Changes your agents make to products, prices or orders show on your live store. Check their edits before your customers see them.",
    "mercury": "Read only: your agents can see your accounts but can't move money.",
    "linkedin": "Only posting and your own profile: your agents can't read your feed or your messages.",
    "instagram": "Works with Business and Creator accounts.",
    "facebook": "Works with the Facebook Pages you manage.",
    "jira": "One sign-in with your Atlassian account covers Jira and Confluence.",
    "kit": "Kit was called ConvertKit.",
    "github": "Your agents act with your GitHub access, in every repository you can reach.",
    "google-ads": "Changes to live campaigns and budgets can spend money.",
    "tiktok-ads": "Changes to live campaigns and budgets can spend money.",
    "vercel": "Changes here can affect your live sites.",
    "cloudflare": "Changes here can affect your live sites.",
    "supabase": "Changes here can affect your live data.",
    "gmail": "Emails your agents send go out from your own address.",
    "outlook": "Emails your agents send go out from your own address.",
    "docusign": "Envelopes your agents send go out in your name.",
  ]
}
