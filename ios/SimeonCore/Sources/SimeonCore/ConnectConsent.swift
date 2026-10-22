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
    else if let things = Self.reaches[key] {
      reach = Self.readOnly.contains(key) ? L10n.text("Your agents can read \(things) in \(title).") : L10n.text("Your agents can read and use \(things) in \(title).")
    }
    else { reach = L10n.text("Your agents can read and use what's in your \(title) account.") }

    points = [
      Point(symbol: "square.stack.3d.up", title: L10n.text("Put \(title) to work"), body: reach),
      Point(symbol: "hand.raised", title: L10n.text("You stay in charge"), body: L10n.text("Auto-review asks for your OK before steps it judges risky. Turn off any of \(title)'s tools, or remove it, in Settings → Connect apps.")),
      Point(symbol: "checkmark.circle", title: L10n.text("Check their work"), body: L10n.text("Agents can misread a request or take a step you didn't expect. Look over what they do in \(title), especially at first.")),
    ]

    let signIn = Self.signInSentence[key]?.replacingOccurrences(of: "{App}", with: title) ?? Self.signInLine(route, title: title)
    smallPrint = [
      signIn,
      L10n.text("What your agents read in \(title) becomes part of your chats with them and is sent to the AI models that do the work."),
      L10n.text("\(title)'s own terms and privacy policy apply to the information it shares with Simeon."),
    ]
    note = Self.notes[key] ?? (Self.money.contains(key) ? L10n.text("Anything that moves money in \(title) is real. Ask your agents to check with you before they move any.") : nil)
  }

  /** Who handles the sign-in, by the app's route. */
  static func signInLine(_ route: Route, title: String) -> String {
    switch route {
    case .composio:
      // The app's own sign-in page may name the partner (Google's does, for Simeon has no Google app of its own yet): said here without its name, so the person isn't surprised.
      return L10n.text("Simeon connects \(title) through a secure sign-in partner, who keeps its access for your agents. \(title)'s page may show the partner's name. Simeon never sees your password.")
    case .vendor(let host):
      return L10n.text("You'll sign in on \(title)'s own page, and \(title) runs this connection from its own server (\(host)). Simeon never sees your password.")
    case .unknown:
      return L10n.text("You'll sign in on \(title)'s own page. Simeon never sees your password.")
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
    "gmail": L10n.text("your emails, threads, labels and drafts"),
    "outlook": L10n.text("your email, folders and calendar"),
    "google-calendar": L10n.text("your calendars, events and invitations"),
    "notion": L10n.text("your pages and databases"),
    "google-drive": L10n.text("your files and folders, and who they're shared with"),
    "dropbox": L10n.text("your files and folders"),
    "airtable": L10n.text("your bases, tables and records"),
    "asana": L10n.text("your tasks, projects and comments"),
    "clickup": L10n.text("your tasks, docs and spaces"),
    "monday": L10n.text("your boards and items"),
    "todoist": L10n.text("your tasks and projects"),
    "zoom": L10n.text("your meetings, recordings, transcripts and Zoom Docs"),
    "google-meet": L10n.text("your meetings and recordings"),
    "figma": L10n.text("your files, frames and design details"),
    "canva": L10n.text("your designs and brand assets"),
    "miro": L10n.text("your boards and what's on them"),
    "webflow": L10n.text("your sites, CMS collections and items"),
    "wix": L10n.text("your sites and collections"),
    "stripe": L10n.text("customers, payments, subscriptions and invoices"),
    "paypal": L10n.text("invoices, orders and transactions"),
    "square": L10n.text("payments, your catalog and orders"),
    "ramp": L10n.text("expenses, cards, bills and reimbursements"),
    "quickbooks": L10n.text("your books, invoices, bills and expenses"),
    "hubspot": L10n.text("contacts, companies, deals and tickets"),
    "salesforce": L10n.text("leads, accounts, opportunities and cases"),
    "intercom": L10n.text("conversations, contacts and Help Center articles"),
    "apollo": L10n.text("people, accounts and sequences"),
    "linear": L10n.text("issues, projects and cycles"),
    "jira": L10n.text("Jira issues and Confluence pages"),
    "github": L10n.text("repositories, issues, pull requests and Actions"),
    "vercel": L10n.text("projects, deployments and logs"),
    "supabase": L10n.text("projects, tables and data"),
    "sentry": L10n.text("errors, releases and performance data"),
    "cloudflare": L10n.text("Workers, KV and their bindings"),
    "mailchimp": L10n.text("audiences, campaigns and automations"),
    "greenhouse": L10n.text("jobs, candidates and your pipeline"),
    "gusto": L10n.text("payroll, employees and time off"),
    "slack": L10n.text("channels, direct messages and the people in them"),
    "google-docs": L10n.text("your documents"),
    "google-sheets": L10n.text("your spreadsheets"),
    "google-slides": L10n.text("your presentations"),
    "onedrive": L10n.text("your files in Microsoft 365"),
    "google-tasks": L10n.text("your tasks and lists"),
    "trello": L10n.text("boards, lists and cards"),
    "xero": L10n.text("invoices, contacts, reports and payroll"),
    "shopify": L10n.text("products, orders, customers and your store's settings"),
    "brex": L10n.text("expenses, receipts, bills, cards and travel"),
    "pipedrive": L10n.text("deals, people and your pipeline"),
    "docusign": L10n.text("envelopes, templates and agreements"),
    "klaviyo": L10n.text("profiles, segments, campaigns and flows"),
    "ashby": L10n.text("candidates, interviews and pipeline tasks"),
    "google-analytics": L10n.text("traffic, conversions and GA4 reports"),
    "google-search-console": L10n.text("search queries, clicks and indexing"),
    "youtube": L10n.text("your channel's videos, playlists and stats"),
    "kit": L10n.text("subscribers, tags and broadcasts"),
    "instagram": L10n.text("posts, comments, messages and insights"),
    "facebook": L10n.text("your Pages' posts, comments, messages and insights"),
    "calendly": L10n.text("booking links, meetings and invitees"),
    "cal-com": L10n.text("bookings, event types and availability"),
    "attio": L10n.text("people, companies, deals and lists"),
    "zendesk": L10n.text("tickets, customers and your help center"),
    "microsoft-teams": L10n.text("chats, channels and meetings"),
    "discord": L10n.text("your servers, channels and invites"),
    "mercury": L10n.text("your accounts, balances and transactions"),
    "posthog": L10n.text("analytics, insights and feature flags"),
    "google-ads": L10n.text("campaigns, ad groups, keywords and results"),
    "tiktok-ads": L10n.text("campaigns, ads, audiences and reports"),
    "granola": L10n.text("your meeting notes, transcripts and folders"),
    "resend": L10n.text("your emails, domains, audiences and broadcasts"),
    "sharepoint": L10n.text("your sites, lists and files"),
    "onenote": L10n.text("your notebooks, sections and pages"),
    "microsoft-to-do": L10n.text("your tasks and lists"),
    "lovable": L10n.text("your projects, workspaces and their code"),
    // 17 October 2026: the ones added that day (the Zoho apps left the same day).
    "whatsapp": L10n.text("your WhatsApp Business messages and templates"),
    "twitch": L10n.text("your channel, streams, clips and chat"),
    "reddit-ads": L10n.text("campaigns, ad groups, ads and reports"),
    "pinterest-ads": L10n.text("campaigns, ad groups and their results"),
    "omnisend": L10n.text("contacts, campaigns and automations"),
    "dub": L10n.text("your short links, QR codes and clicks"),
    "eventbrite": L10n.text("your events, tickets, orders and attendees"),
    "google-photos": L10n.text("your photos and albums"),
    "mural": L10n.text("your workspaces, murals and sticky notes"),
    "zeplin": L10n.text("projects, screens, components and style guides"),
    "contentful": L10n.text("your spaces, content types and entries"),
    "box": L10n.text("your files and folders, and who they're shared with"),
    "confluence": L10n.text("your spaces and pages"),
    "notebooklm": L10n.text("your notebooks, sources and audio overviews"),
    "basecamp": L10n.text("your projects, to-dos, messages and schedules"),
    "wrike": L10n.text("your tasks, projects and folders"),
    "ticktick": L10n.text("your tasks and lists"),
    "harvest": L10n.text("time entries, projects, clients and invoices"),
    "typeform": L10n.text("your forms and their responses"),
    "productboard": L10n.text("features, notes and customer feedback"),
    "google-maps": L10n.text("places, directions and travel times"),
    "webex": L10n.text("your meetings, recordings and messages"),
    "fathom": L10n.text("your recorded meetings, summaries and transcripts"),
    "freshbooks": L10n.text("invoices, clients, expenses and time"),
    "ynab": L10n.text("your budgets, accounts and transactions"),
    "splitwise": L10n.text("your shared expenses, groups and balances"),
    "shippo": L10n.text("shipping rates, labels and tracking"),
    "dynamics-365": L10n.text("leads, accounts, contacts and opportunities"),
    "gitlab": L10n.text("projects, issues, merge requests and pipelines"),
    "bitbucket": L10n.text("repositories, pull requests and pipelines"),
    "pagerduty": L10n.text("incidents, on-call schedules and services"),
    "google-bigquery": L10n.text("your datasets and tables"),
    "hugging-face": L10n.text("your models, datasets and Spaces"),
    "excalidraw": L10n.text("the diagrams they draw"),
    "heygen": L10n.text("your videos, avatars and voices"),
    "higgsfield": L10n.text("your images, videos and characters"),
    "gamma": L10n.text("your presentations, documents and pages"),
    "descript": L10n.text("your projects, media and edits"),
    "lucid": L10n.text("your diagrams and boards"),
    "eraser": L10n.text("your diagrams and documents"),
    "mobbin": L10n.text("Mobbin's library of app screens and flows"),
    "magic-patterns": L10n.text("your designs and their history"),
    "pandadoc": L10n.text("your documents, templates and their status"),
    "otter": L10n.text("your meeting transcripts and summaries"),
    "read-ai": L10n.text("your meeting summaries, transcripts and action items"),
    "fellow": L10n.text("your meeting notes, action items and agendas"),
    "plaid": L10n.text("your Plaid integration's Items, Link conversion and usage"),
    "clay": L10n.text("your tables, and research on companies and people"),
    "netlify": L10n.text("your sites, deploys and environment settings"),
    "neon": L10n.text("your projects, branches and databases"),
    // 17 October 2026, later: 52 on their makers' own servers.
    "beehiiv": L10n.text("your publications, posts and subscribers"),
    "mailerlite": L10n.text("subscribers, groups, campaigns and automations"),
    "getresponse": L10n.text("contacts, lists, newsletters and automations"),
    "customer-io": L10n.text("people, segments, campaigns and messages"),
    "lemlist": L10n.text("your campaigns, leads and replies"),
    "mixpanel": L10n.text("your projects' events, funnels and retention"),
    "amplitude": L10n.text("your charts, dashboards, cohorts and experiments"),
    "bitly": L10n.text("your short links, QR codes and clicks"),
    "brevo": L10n.text("contacts, lists, and email and SMS campaigns"),
    "creatomate": L10n.text("your templates and the videos and images made from them"),
    "shotstack": L10n.text("your video edits and renders"),
    "bannerbear": L10n.text("your templates and the images and videos made from them"),
    "cloudinary": L10n.text("your images, videos and folders"),
    "sanity": L10n.text("your projects, documents and schemas"),
    "wistia": L10n.text("your videos, channels and stats"),
    "captions": L10n.text("your videos and projects"),
    "storyblok": L10n.text("your spaces, stories, components and assets"),
    "coda": L10n.text("your docs, tables and pages"),
    "make": L10n.text("your scenarios and their runs"),
    "tally": L10n.text("your forms and their submissions"),
    "jotform": L10n.text("your forms and their submissions"),
    "surveymonkey": L10n.text("your surveys and their responses"),
    "canny": L10n.text("feature requests, votes, comments and your roadmap"),
    "fireflies": L10n.text("your meeting transcripts, summaries and action items"),
    "tldv": L10n.text("your meeting recordings, transcripts and notes"),
    "avoma": L10n.text("your meeting notes, transcripts and deal insights"),
    "missive": L10n.text("your team inbox's conversations, drafts and tasks"),
    "mixmax": L10n.text("your sequences, meetings and email tracking"),
    "close": L10n.text("leads, contacts, opportunities and calls"),
    "aircall": L10n.text("your team's calls and their details"),
    "workable": L10n.text("jobs, candidates and your hiring pipeline"),
    "breezy-hr": L10n.text("positions, candidates and your pipeline"),
    "postman": L10n.text("your workspaces, collections and APIs"),
    "railway": L10n.text("your projects, services, deploys and logs"),
    "datadog": L10n.text("logs, metrics, monitors and incidents"),
    "shortcut": L10n.text("stories, epics and iterations"),
    "razorpay": L10n.text("payments, orders, refunds and settlements"),
    "typefully": L10n.text("your drafts, scheduled posts and social accounts"),
    // 22 October 2026: the 45 the teams in `server/simeon/desktop/packs.json` ask for (those that answer from their own data are in `reachSentence`).
    "gem": L10n.text("candidates, jobs, your pipeline and outreach"),
    "meta-ads": L10n.text("campaigns, ad sets, ads and results"),
    "loop-returns": L10n.text("your store's returns, exchanges and refunds"),
    "upwork": L10n.text("jobs, freelancers, proposals and contracts"),
    "karbon": L10n.text("your clients, work items and deadlines"),
    "ignition": L10n.text("proposals, clients, invoices and payments"),
    "appfolio": L10n.text("properties, units, tenants and work orders"),
    "jobber": L10n.text("clients, quotes, jobs and invoices"),
    "companycam": L10n.text("your projects, job site photos and checklists"),
    "bamboohr": L10n.text("employees, time off, job openings and applicants"),
    "7shifts": L10n.text("your shifts, locations and team"),
    "tiktok": L10n.text("your videos, posts and stats"),
    "follow-up-boss": L10n.text("leads, people, deals and appointments"),
    "matterport": L10n.text("your 3D tours and their spaces"),
    "zoho-inventory": L10n.text("items, stock, sales orders and invoices"),
    "toggl": L10n.text("time entries, projects, clients and reports"),
    "heyreach": L10n.text("your LinkedIn campaigns, leads and conversations"),
    "hireflix": L10n.text("your positions, interviews and candidates' answers"),
    "clio": L10n.text("clients, matters, calendars, tasks and bills"),
    "draftable": L10n.text("your document comparisons and their links"),
    "chaser": L10n.text("customers, invoices and who owes what"),
    "taxjar": L10n.text("sales tax rates, transactions and customers"),
    "maintainx": L10n.text("work orders, requests, assets and locations"),
    "seam": L10n.text("your smart locks, spaces and access codes"),
    "route4me": L10n.text("your routes, stops and orders"),
    "gatherup": L10n.text("your businesses, customers and feedback requests"),
    "oneup": L10n.text("your scheduled posts, social accounts and their results"),
    "mindbody": L10n.text("your studio's classes, appointments, clients and sales"),
  ]

  /** Apps the agents can only read (the catalog says so). */
  static let readOnly: Set<String> = ["mercury", "figma", "otter", "plaid", "tldv", "draftable"]

  /** Apps whose reach is said another way. */
  static let reachSentence: [String: String] = [
    "linkedin": L10n.text("Your agents can read your profile and publish posts on {App}."),
    "link": L10n.text("Your agents can ask {App} for a one-time card to pay for something you asked them to buy, and read the bank and card accounts you choose to share."),
    "shop": L10n.text("Your agents can find products across Shopify stores, pay for what you asked them to buy with your {App} card, and track your orders."),
    // Services that answer from their own data (the web, search engines, contact databases) or run AI models, not an account's records.
    "ahrefs": L10n.text("Your agents can look up backlinks, keywords and site audits in {App}."),
    "moz": L10n.text("Your agents can look up domain authority, links and keywords in {App}."),
    "dataforseo": L10n.text("Your agents can look up search results, keywords and backlinks with {App}."),
    "semrush": L10n.text("Your agents can look up keywords, traffic and backlinks for any site in {App}."),
    "hunter": L10n.text("Your agents can find and verify professional email addresses with {App}."),
    "lusha": L10n.text("Your agents can look up contact and company details with {App}."),
    "tavily": L10n.text("Your agents can search the web and read pages through {App}."),
    "exa": L10n.text("Your agents can search the web and read pages through {App}."),
    "runway": L10n.text("Your agents can make and edit videos and images with {App}'s AI models."),
    "black-forest-labs": L10n.text("Your agents can make and edit images with {App}, Black Forest Labs' AI models."),
    "fal": L10n.text("Your agents can run {App}'s AI models for images, video and audio."),
    "replicate": L10n.text("Your agents can run AI models on {App}."),
    "elevenlabs": L10n.text("Your agents can make speech, sound effects and music with {App}, and use your voices."),
    "coinbase": L10n.text("Your agents can use your {App} account through Coinbase for Agents, within what you allow when you sign in."),
    // 22 October 2026, the same kind among the 45 of `packs.json`: data, search and estimates; Uber, Instacart and TaskRabbit hand the booking or the order to the person.
    "crunchbase": L10n.text("Your agents can look up companies, funding rounds, investors and the people behind them in {App}."),
    "courtlistener": L10n.text("Your agents can search case law, court dockets and judges in {App}, and set up alerts."),
    "uber": L10n.text("Your agents can get ride estimates from {App}, and links to book a ride."),
    "instacart": L10n.text("Your agents can turn recipes and shopping lists into {App} pages to order from."),
    "taskrabbit": L10n.text("Your agents can check {App}'s services, prices and Taskers near you, and start a booking for you to finish."),
    "veryfi": L10n.text("Your agents can turn receipts, invoices and bills into data with {App}."),
    "yelp": L10n.text("Your agents can find businesses and events on {App}, and read their reviews and ratings."),
    "vidiq": L10n.text("Your agents can research YouTube channels, videos, trends and keywords with {App}, and read your own channel's stats."),
    "youtube-transcript": L10n.text("Your agents can get the transcripts of YouTube videos, playlists and channels with {App}."),
    "hypeauditor": L10n.text("Your agents can find influencers and look up their audiences and reach with {App}."),
    "zoominfo": L10n.text("Your agents can look up companies, contacts, buying intent and news with {App}."),
    "contactout": L10n.text("Your agents can find emails and phone numbers for people and companies with {App}."),
    "midpage": L10n.text("Your agents can search case law, court filings and statutes in {App}, with citations."),
    "vaquill": L10n.text("Your agents can look up US statutes, session laws and citations with {App}."),
    "aiwyn-tax": L10n.text("Your agents can estimate federal and state taxes with {App}."),
    "ignav": L10n.text("Your agents can search flights and fares with {App}, and get links to book them."),
    "tripadvisor": L10n.text("Your agents can look up hotels, restaurants and things to do on {App}, with their reviews and photos."),
  ]

  /** Apps whose sign-in is said another way. */
  static let signInSentence: [String: String] = [
    // Link signs in with a code on link.com or in its app, and runs on Simeon's cloud computer (desktop/source/shared/node/link-wallet/).
    "link": L10n.text("You'll approve the connection on link.com or in the {App} app; your cloud computer keeps it. Simeon never sees your password or your card numbers."),
    // Shop signs in with a code on Shop's own page, and runs from Simeon's cloud computer (desktop/source/shared/node/shop-wallet/).
    "shop": L10n.text("You'll approve the connection on {App}'s own page with your {App} account; your cloud computer keeps it. Simeon never sees your password or your card numbers."),
    // Excalidraw's server answers anyone (`noSignIn` in the catalog): there is nothing to sign in to.
    "excalidraw": L10n.text("There's nothing to sign in to: your agents draw on {App}'s own server (mcp.excalidraw.com), and Simeon holds no account of yours there."),
    // TaskRabbit's answers anyone too (`noSignIn`, 22 October 2026); the booking it starts is finished on TaskRabbit, by the person.
    "taskrabbit": L10n.text("There's nothing to sign in to: your agents search on {App}'s own server (mcp.taskrabbit.com), and Simeon holds no account of yours there."),
  ]

  /** Apps where money moves for real. */
  static let money: Set<String> = ["stripe", "paypal", "square", "ramp", "brex", "quickbooks", "xero", "gusto", "freshbooks", "razorpay", "coinbase", "loop-returns", "upwork", "ignition"]

  /** One more thing worth knowing about an app. */
  static let notes: [String: String] = [
    "shopify": L10n.text("Changes your agents make to products, prices or orders show on your live store. Check their edits before your customers see them."),
    "mercury": L10n.text("Read only: your agents can see your accounts but can't move money."),
    "linkedin": L10n.text("Only posting and your own profile: your agents can't read your feed or your messages."),
    "instagram": L10n.text("Works with Business and Creator accounts."),
    "facebook": L10n.text("Works with the Facebook Pages you manage."),
    "jira": L10n.text("One sign-in with your Atlassian account covers Jira and Confluence."),
    "kit": L10n.text("Kit was called ConvertKit."),
    "github": L10n.text("Your agents act with your GitHub access, in every repository you can reach."),
    "google-ads": L10n.text("Changes to live campaigns and budgets can spend money."),
    "tiktok-ads": L10n.text("Changes to live campaigns and budgets can spend money."),
    "vercel": L10n.text("Changes here can affect your live sites."),
    "cloudflare": L10n.text("Changes here can affect your live sites."),
    "supabase": L10n.text("Changes here can affect your live data."),
    "gmail": L10n.text("Emails your agents send go out from your own address."),
    "outlook": L10n.text("Emails your agents send go out from your own address."),
    "docusign": L10n.text("Envelopes your agents send go out in your name."),
    "resend": L10n.text("Emails your agents send go out from your own domains."),
    "lovable": L10n.text("Your agents can change and publish your projects. Published changes go live."),
    "whatsapp": L10n.text("Works with WhatsApp Business accounts, not personal WhatsApp. Messages your agents send go out from your business number."),
    "notebooklm": L10n.text("Works with NotebookLM Enterprise in a licensed Google Cloud project, not the free NotebookLM."),
    "reddit-ads": L10n.text("Changes to live campaigns and budgets can spend money."),
    "pinterest-ads": L10n.text("Changes to live campaigns and budgets can spend money."),
    "pandadoc": L10n.text("Documents your agents send go out in your name."),
    "shippo": L10n.text("Labels your agents buy are charged to your Shippo account."),
    "gitlab": L10n.text("Your agents act with your GitLab access, in every project you can reach."),
    "bitbucket": L10n.text("Your agents act with your Bitbucket access, in every repository you can reach."),
    "netlify": L10n.text("Changes here can affect your live sites."),
    "neon": L10n.text("Changes here can affect your live data."),
    "contentful": L10n.text("Entries your agents publish go live on your site."),
    "google-bigquery": L10n.text("Queries are billed to your Google Cloud project."),
    "heygen": L10n.text("Making videos uses your HeyGen credits."),
    "higgsfield": L10n.text("Making images and videos uses your Higgsfield credits."),
    "gamma": L10n.text("Making presentations uses your Gamma credits."),
    "clay": L10n.text("Enrichment uses your Clay credits."),
    "excalidraw": L10n.text("A drawing your agents share gets a link on excalidraw.com that anyone with the link can open."),
    "plaid": L10n.text("For teams building on Plaid: it reads your integration's dashboard, not your own bank accounts."),
    "shop": L10n.text("Nothing is paid until you press Allow on the purchase. At a Shopify store, Shop then places the order with your Shop card; anywhere else, you approve it in the Shop app and the store gets a one-time card, never your real one."),
    "link": L10n.text("Nothing is paid until you approve the purchase in the Link app, up to $500 each and $500 a day. Get the Link app on your phone (or add a passkey at link.com): Link approves agents' purchases only there. Each purchase gets its own one-time card, never your real one. US accounts only."),
    "beehiiv": L10n.text("Posts your agents send reach your real subscribers."),
    "mailerlite": L10n.text("Campaigns your agents send reach your real subscribers."),
    "getresponse": L10n.text("Newsletters your agents send reach your real contacts."),
    "customer-io": L10n.text("Messages your agents send reach real people."),
    "brevo": L10n.text("Emails and texts your agents send reach your real contacts."),
    "lemlist": L10n.text("Campaigns your agents start send real emails to your leads."),
    "mixmax": L10n.text("Emails your agents send go out from your own address."),
    "missive": L10n.text("Messages your agents send go out from your team's addresses."),
    "typefully": L10n.text("Posts your agents publish go out on your accounts."),
    "sanity": L10n.text("Documents your agents publish go live on your site."),
    "storyblok": L10n.text("Stories your agents publish go live on your site."),
    "railway": L10n.text("Changes here can affect your live services."),
    "make": L10n.text("Scenarios your agents run do real work in the apps they connect, and use your Make operations."),
    "runway": L10n.text("Making videos and images uses your Runway credits."),
    "black-forest-labs": L10n.text("Making images uses your Black Forest Labs credits."),
    "fal": L10n.text("Running models uses your fal.ai credits."),
    "replicate": L10n.text("Replicate's page asks for an API token from your Replicate account. Running models is billed to that account."),
    "elevenlabs": L10n.text("Making speech, sound effects and music uses your ElevenLabs credits."),
    "creatomate": L10n.text("Rendering uses your Creatomate credits."),
    "shotstack": L10n.text("Rendering uses your Shotstack credits."),
    "bannerbear": L10n.text("Making images and videos uses your Bannerbear credits."),
    "dataforseo": L10n.text("Each lookup is charged to your DataForSEO balance."),
    "hunter": L10n.text("Searches and verifications use your Hunter credits."),
    "lusha": L10n.text("Lookups use your Lusha credits."),
    "tavily": L10n.text("Searches use your Tavily credits."),
    "exa": L10n.text("Searches are billed to your Exa account."),
    "moz": L10n.text("Needs a Moz API plan."),
    "canny": L10n.text("Works on Canny's Pro plan."),
    "tldv": L10n.text("Read only, on tl;dv's Pro plan."),
    "datadog": L10n.text("Works with Datadog's US1 site (app.datadoghq.com)."),
    "coinbase": L10n.text("Anything that moves money or crypto in Coinbase is real. Ask your agents to check with you before they move any. Coinbase may let only apps it has approved sign in; if its page refuses, Coinbase can't be connected yet."),
    // 22 October 2026, the 45 of `packs.json`. Each app whose sign-in page asks for the person's own key says so, as Replicate's does.
    "crunchbase": L10n.text("Needs a Crunchbase plan with MCP access, given by your workspace owner."),
    "meta-ads": L10n.text("Changes to live campaigns and budgets can spend money."),
    "7shifts": L10n.text("The sign-in page asks for an access token from your 7shifts account."),
    "veryfi": L10n.text("The sign-in page asks for an API key from your Veryfi account. Each document read can be billed to that account."),
    "tiktok": L10n.text("Videos and photos your agents post go out on your TikTok account."),
    "zoho-inventory": L10n.text("Invoices and statements your agents email go out to your real customers."),
    "toggl": L10n.text("The sign-in page asks for an API token from your Toggl account."),
    "vidiq": L10n.text("Research uses your vidIQ credits."),
    "youtube-transcript": L10n.text("The sign-in page asks for an API key from your YouTube Transcript account. Fetching new transcripts uses that account's credits."),
    "hypeauditor": L10n.text("The sign-in page asks for an API key from your HypeAuditor account."),
    "zoominfo": L10n.text("Enrichment uses your ZoomInfo credits."),
    "heyreach": L10n.text("The sign-in page asks for an API key from your HeyReach account."),
    "contactout": L10n.text("The sign-in page asks for an API token from your ContactOut account. Lookups use your ContactOut credits."),
    "hireflix": L10n.text("The sign-in page asks for an API key from your Hireflix account. Invitations your agents send reach real candidates."),
    "draftable": L10n.text("The sign-in page asks for an API key from your Draftable account."),
    "chaser": L10n.text("The sign-in page asks for an API key from your Chaser account."),
    "vaquill": L10n.text("The sign-in page asks for an API key from your Vaquill account. Lookups use your Vaquill credits."),
    "taxjar": L10n.text("The sign-in page asks for an API token from your TaxJar account. Transactions your agents record count in your sales tax reports and filings."),
    "maintainx": L10n.text("The sign-in page asks for an API key from your MaintainX account."),
    "seam": L10n.text("The sign-in page asks for an API key from your Seam account. Access codes and keys your agents grant open real doors."),
    "route4me": L10n.text("The sign-in page asks for an API key from your Route4Me account."),
    "gatherup": L10n.text("The sign-in page asks for an API key from your GatherUp account. Feedback requests your agents send reach your real customers."),
    "oneup": L10n.text("The sign-in page asks for an API key from your OneUp account. Posts your agents publish go out on your accounts."),
    "mindbody": L10n.text("The sign-in page asks for an API key from your Mindbody account."),
    "ignav": L10n.text("The sign-in page asks for an API key from your Ignav account."),
    "tripadvisor": L10n.text("The sign-in page asks for an API key from your Tripadvisor account."),
  ]
}
