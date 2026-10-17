import Foundation

/**
 * What the person reads before an app's sign-in page opens (the founder,
 * 9 October 2026: "when you click on add … before you go to the link to
 * connect"): the app, what the agents will be able to reach in it, that
 * the person stays in charge, that agents can get things wrong, who handles
 * the sign-in (Simeon, through its sign-in partner, for the apps Simeon's
 * server serves; the app itself for the rest), where the information goes,
 * and, for some apps, one more thing worth knowing about that app. One
 * template; each app fills it a little differently. The partner is not
 * named (the founder, 13 October 2026: "white label composio as best as you
 * can"); the privacy policy covers it as a provider of app connections.
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

    let signIn = Self.signInSentence[key]?.replacingOccurrences(of: "{App}", with: title) ?? Self.signInLine(route, title: title)
    smallPrint = [
      signIn,
      "What your agents read in \(title) becomes part of your chats with them and is sent to the AI models that do the work.",
      "\(title)'s own terms and privacy policy apply to the information it shares with Simeon.",
    ]
    note = Self.notes[key] ?? (Self.money.contains(key) ? "Anything that moves money in \(title) is real. Ask your agents to check with you before they move any." : nil)
  }

  /** Who handles the sign-in, by the app's route. */
  static func signInLine(_ route: Route, title: String) -> String {
    switch route {
    case .composio:
      // The app's own sign-in page may name the partner (Google's does, for Simeon has no Google app of its own yet): said here without its name, so the person isn't surprised.
      return "Simeon connects \(title) through a secure sign-in partner, who keeps its access for your agents. \(title)'s page may show the partner's name. Simeon never sees your password."
    case .vendor(let host):
      return "You'll sign in on \(title)'s own page, and \(title) runs this connection from its own server (\(host)). Simeon never sees your password."
    case .unknown:
      return "You'll sign in on \(title)'s own page. Simeon never sees your password."
    }
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
    "granola": "your meeting notes, transcripts and folders",
    "resend": "your emails, domains, audiences and broadcasts",
    "sharepoint": "your sites, lists and files",
    "onenote": "your notebooks, sections and pages",
    "microsoft-to-do": "your tasks and lists",
    "lovable": "your projects, workspaces and their code",
    // 17 October 2026: the ones added that day (the Zoho apps left the same day).
    "whatsapp": "your WhatsApp Business messages and templates",
    "twitch": "your channel, streams, clips and chat",
    "reddit-ads": "campaigns, ad groups, ads and reports",
    "pinterest-ads": "campaigns, ad groups and their results",
    "omnisend": "contacts, campaigns and automations",
    "dub": "your short links, QR codes and clicks",
    "eventbrite": "your events, tickets, orders and attendees",
    "google-photos": "your photos and albums",
    "mural": "your workspaces, murals and sticky notes",
    "zeplin": "projects, screens, components and style guides",
    "contentful": "your spaces, content types and entries",
    "box": "your files and folders, and who they're shared with",
    "confluence": "your spaces and pages",
    "notebooklm": "your notebooks, sources and audio overviews",
    "basecamp": "your projects, to-dos, messages and schedules",
    "wrike": "your tasks, projects and folders",
    "ticktick": "your tasks and lists",
    "harvest": "time entries, projects, clients and invoices",
    "typeform": "your forms and their responses",
    "productboard": "features, notes and customer feedback",
    "google-maps": "places, directions and travel times",
    "webex": "your meetings, recordings and messages",
    "fathom": "your recorded meetings, summaries and transcripts",
    "freshbooks": "invoices, clients, expenses and time",
    "ynab": "your budgets, accounts and transactions",
    "splitwise": "your shared expenses, groups and balances",
    "shippo": "shipping rates, labels and tracking",
    "dynamics-365": "leads, accounts, contacts and opportunities",
    "gitlab": "projects, issues, merge requests and pipelines",
    "bitbucket": "repositories, pull requests and pipelines",
    "pagerduty": "incidents, on-call schedules and services",
    "google-bigquery": "your datasets and tables",
    "hugging-face": "your models, datasets and Spaces",
    "excalidraw": "the diagrams they draw",
    "heygen": "your videos, avatars and voices",
    "higgsfield": "your images, videos and characters",
    "gamma": "your presentations, documents and pages",
    "descript": "your projects, media and edits",
    "lucid": "your diagrams and boards",
    "eraser": "your diagrams and documents",
    "mobbin": "Mobbin's library of app screens and flows",
    "magic-patterns": "your designs and their history",
    "pandadoc": "your documents, templates and their status",
    "otter": "your meeting transcripts and summaries",
    "read-ai": "your meeting summaries, transcripts and action items",
    "fellow": "your meeting notes, action items and agendas",
    "plaid": "your Plaid integration's Items, Link conversion and usage",
    "clay": "your tables, and research on companies and people",
    "netlify": "your sites, deploys and environment settings",
    "neon": "your projects, branches and databases",
    // 17 October 2026, later: 52 on their makers' own servers.
    "beehiiv": "your publications, posts and subscribers",
    "mailerlite": "subscribers, groups, campaigns and automations",
    "getresponse": "contacts, lists, newsletters and automations",
    "customer-io": "people, segments, campaigns and messages",
    "lemlist": "your campaigns, leads and replies",
    "mixpanel": "your projects' events, funnels and retention",
    "amplitude": "your charts, dashboards, cohorts and experiments",
    "bitly": "your short links, QR codes and clicks",
    "brevo": "contacts, lists, and email and SMS campaigns",
    "creatomate": "your templates and the videos and images made from them",
    "shotstack": "your video edits and renders",
    "bannerbear": "your templates and the images and videos made from them",
    "cloudinary": "your images, videos and folders",
    "sanity": "your projects, documents and schemas",
    "wistia": "your videos, channels and stats",
    "captions": "your videos and projects",
    "storyblok": "your spaces, stories, components and assets",
    "coda": "your docs, tables and pages",
    "make": "your scenarios and their runs",
    "tally": "your forms and their submissions",
    "jotform": "your forms and their submissions",
    "surveymonkey": "your surveys and their responses",
    "canny": "feature requests, votes, comments and your roadmap",
    "fireflies": "your meeting transcripts, summaries and action items",
    "tldv": "your meeting recordings, transcripts and notes",
    "avoma": "your meeting notes, transcripts and deal insights",
    "missive": "your team inbox's conversations, drafts and tasks",
    "mixmax": "your sequences, meetings and email tracking",
    "close": "leads, contacts, opportunities and calls",
    "aircall": "your team's calls and their details",
    "workable": "jobs, candidates and your hiring pipeline",
    "breezy-hr": "positions, candidates and your pipeline",
    "postman": "your workspaces, collections and APIs",
    "railway": "your projects, services, deploys and logs",
    "datadog": "logs, metrics, monitors and incidents",
    "shortcut": "stories, epics and iterations",
    "razorpay": "payments, orders, refunds and settlements",
    "typefully": "your drafts, scheduled posts and social accounts",
  ]

  /** Apps the agents can only read (the catalog says so). */
  static let readOnly: Set<String> = ["mercury", "figma", "otter", "plaid", "tldv"]

  /** Apps whose reach is said another way. */
  static let reachSentence: [String: String] = [
    "linkedin": "Your agents can read your profile and publish posts on {App}.",
    "link": "Your agents can ask {App} for a one-time card to pay for something you asked them to buy, and read the bank and card accounts you choose to share.",
    "shop": "Your agents can find products across Shopify stores, pay for what you asked them to buy with your {App} card, and track your orders.",
    // Services that answer from their own data (the web, search engines, contact databases) or run AI models, not an account's records.
    "ahrefs": "Your agents can look up backlinks, keywords and site audits in {App}.",
    "moz": "Your agents can look up domain authority, links and keywords in {App}.",
    "dataforseo": "Your agents can look up search results, keywords and backlinks with {App}.",
    "semrush": "Your agents can look up keywords, traffic and backlinks for any site in {App}.",
    "hunter": "Your agents can find and verify professional email addresses with {App}.",
    "lusha": "Your agents can look up contact and company details with {App}.",
    "tavily": "Your agents can search the web and read pages through {App}.",
    "exa": "Your agents can search the web and read pages through {App}.",
    "runway": "Your agents can make and edit videos and images with {App}'s AI models.",
    "black-forest-labs": "Your agents can make and edit images with {App}, Black Forest Labs' AI models.",
    "fal": "Your agents can run {App}'s AI models for images, video and audio.",
    "replicate": "Your agents can run AI models on {App}.",
    "elevenlabs": "Your agents can make speech, sound effects and music with {App}, and use your voices.",
    "coinbase": "Your agents can use your {App} account through Coinbase for Agents, within what you allow when you sign in.",
  ]

  /** Apps whose sign-in is said another way. */
  static let signInSentence: [String: String] = [
    // Link signs in with a code on link.com or in its app, and runs on Simeon's cloud computer (desktop/source/shared/node/link-wallet/).
    "link": "You'll approve the connection on link.com or in the {App} app; your cloud computer keeps it. Simeon never sees your password or your card numbers.",
    // Shop signs in with a code on Shop's own page, and runs from Simeon's cloud computer (desktop/source/shared/node/shop-wallet/).
    "shop": "You'll approve the connection on {App}'s own page with your {App} account; your cloud computer keeps it. Simeon never sees your password or your card numbers.",
    // Excalidraw's server answers anyone (`noSignIn` in the catalog): there is nothing to sign in to.
    "excalidraw": "There's nothing to sign in to: your agents draw on {App}'s own server (mcp.excalidraw.com), and Simeon holds no account of yours there.",
  ]

  /** Apps where money moves for real. */
  static let money: Set<String> = ["stripe", "paypal", "square", "ramp", "brex", "quickbooks", "xero", "gusto", "freshbooks", "razorpay", "coinbase"]

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
    "resend": "Emails your agents send go out from your own domains.",
    "lovable": "Your agents can change and publish your projects. Published changes go live.",
    "whatsapp": "Works with WhatsApp Business accounts, not personal WhatsApp. Messages your agents send go out from your business number.",
    "notebooklm": "Works with NotebookLM Enterprise in a licensed Google Cloud project, not the free NotebookLM.",
    "reddit-ads": "Changes to live campaigns and budgets can spend money.",
    "pinterest-ads": "Changes to live campaigns and budgets can spend money.",
    "pandadoc": "Documents your agents send go out in your name.",
    "shippo": "Labels your agents buy are charged to your Shippo account.",
    "gitlab": "Your agents act with your GitLab access, in every project you can reach.",
    "bitbucket": "Your agents act with your Bitbucket access, in every repository you can reach.",
    "netlify": "Changes here can affect your live sites.",
    "neon": "Changes here can affect your live data.",
    "contentful": "Entries your agents publish go live on your site.",
    "google-bigquery": "Queries are billed to your Google Cloud project.",
    "heygen": "Making videos uses your HeyGen credits.",
    "higgsfield": "Making images and videos uses your Higgsfield credits.",
    "gamma": "Making presentations uses your Gamma credits.",
    "clay": "Enrichment uses your Clay credits.",
    "excalidraw": "A drawing your agents share gets a link on excalidraw.com that anyone with the link can open.",
    "plaid": "For teams building on Plaid: it reads your integration's dashboard, not your own bank accounts.",
    "shop": "Nothing is paid until you press Allow on the purchase. At a Shopify store, Shop then places the order with your Shop card; anywhere else, you approve it in the Shop app and the store gets a one-time card, never your real one.",
    "link": "Nothing is paid until you approve the purchase in the Link app, up to $500 each and $500 a day. Get the Link app on your phone (or add a passkey at link.com): Link approves agents' purchases only there. Each purchase gets its own one-time card, never your real one. US accounts only.",
    "beehiiv": "Posts your agents send reach your real subscribers.",
    "mailerlite": "Campaigns your agents send reach your real subscribers.",
    "getresponse": "Newsletters your agents send reach your real contacts.",
    "customer-io": "Messages your agents send reach real people.",
    "brevo": "Emails and texts your agents send reach your real contacts.",
    "lemlist": "Campaigns your agents start send real emails to your leads.",
    "mixmax": "Emails your agents send go out from your own address.",
    "missive": "Messages your agents send go out from your team's addresses.",
    "typefully": "Posts your agents publish go out on your accounts.",
    "sanity": "Documents your agents publish go live on your site.",
    "storyblok": "Stories your agents publish go live on your site.",
    "railway": "Changes here can affect your live services.",
    "make": "Scenarios your agents run do real work in the apps they connect, and use your Make operations.",
    "runway": "Making videos and images uses your Runway credits.",
    "black-forest-labs": "Making images uses your Black Forest Labs credits.",
    "fal": "Running models uses your fal.ai credits.",
    "replicate": "Replicate's page asks for an API token from your Replicate account. Running models is billed to that account.",
    "elevenlabs": "Making speech, sound effects and music uses your ElevenLabs credits.",
    "creatomate": "Rendering uses your Creatomate credits.",
    "shotstack": "Rendering uses your Shotstack credits.",
    "bannerbear": "Making images and videos uses your Bannerbear credits.",
    "dataforseo": "Each lookup is charged to your DataForSEO balance.",
    "hunter": "Searches and verifications use your Hunter credits.",
    "lusha": "Lookups use your Lusha credits.",
    "tavily": "Searches use your Tavily credits.",
    "exa": "Searches are billed to your Exa account.",
    "moz": "Needs a Moz API plan.",
    "canny": "Works on Canny's Pro plan.",
    "tldv": "Read only, on tl;dv's Pro plan.",
    "datadog": "Works with Datadog's US1 site (app.datadoghq.com).",
    "coinbase": "Anything that moves money or crypto in Coinbase is real. Ask your agents to check with you before they move any. Coinbase may let only apps it has approved sign in; if its page refuses, Coinbase can't be connected yet.",
  ]
}
