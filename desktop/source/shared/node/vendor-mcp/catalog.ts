import { getConfiguredBackendUrl } from "../simeon-token.js";

export const VENDOR_MCP_GROUP = {
  MailCalendar: "Mail & Calendar",
  FilesDocs: "Files & Docs",
  Productivity: "Productivity & Tasks",
  Meetings: "Meetings",
  Creativity: "Creativity",
  Finance: "Finance & Money",
  Sales: "Sales & Customers",
  Developer: "Developer",
  Marketing: "Marketing & Growth",
  Hiring: "Hiring & People",
  Social: "Social",
  Learning: "Learning",
} as const;

export type VendorMcpGroup = (typeof VENDOR_MCP_GROUP)[keyof typeof VENDOR_MCP_GROUP];

export interface VendorMcpConnector {
  readonly id: string;
  readonly name: string;
  readonly category: VendorMcpGroup;
  readonly description: string;
  readonly url?: string;
  readonly comingSoon?: true;
  /**
   * The key of an app Simeon Labs registered in the vendor's own console, a
   * public client signing in with PKCE. When set, the sign-in skips dynamic
   * registration. Measured 24 September 2026: Dropbox answers every
   * self-registered client with one shared id (`ydww2fwnzkxganl`) and names
   * it "Self host app (Unknown agent)" on its consent page whatever
   * `client_name` said; only an app made in its App Console carries our name.
   */
  readonly clientId?: string;
  /**
   * The vendor sends a sign-in back only to this computer's own address
   * (`http://localhost:8787/callback`), never to Simeon Labs' hosted one,
   * so the computer asks for the loopback even when the sign-in is started
   * from the iPhone, the Mac app in Swift or the web; the two apps listen
   * there while their sign-in sheet is open (`SimeonCore/LoopbackSignIn.swift`).
   * Measured 11 October 2026: Canva's authorize page answers "Invalid
   * redirect URI", Square's and Vercel's registration refuse the hosted
   * address, and Dropbox registers no client for it; each took the loopback.
   */
  readonly loopbackOnly?: true;
  /**
   * An app served by Simeon Labs' own apps service (`server/simeon/desktop/apps.py`)
   * instead of a vendor's MCP: the tools and the sign-in link come from our
   * server, the app's slug is this. Added 28 September 2026 ("for the rest of
   * the connectors … white label it"); `url` is our server's address for it.
   */
  readonly appsToolkit?: string;
  /**
   * An app run on the person's cloud computer instead of at a server
   * (13 October 2026): Link, Stripe's agent wallet, through
   * `@stripe/link-cli` (`../link-wallet/`); since 14 October 2026 Shop,
   * Shopify's Shop MCP called from the computer with the person's own
   * sign-in kept there (`../shop-wallet/`). Its tools and its device-code
   * sign-in come from the computer; `url` is the app's own page.
   */
  readonly boxCli?: "link" | "shop";
  /**
   * The maker's server needs no sign-in (17 October 2026: Excalidraw's,
   * which answers its tools to anyone). Adding it connects it: its tools are
   * called with no bearer, and its row is marked connected at once.
   */
  readonly noSignIn?: true;
}

/** Our server's MCP address for an app it serves (`/desktop/api/apps/mcp/<toolkit>`). */
export function appsMcpUrl(toolkit: string, backendUrl: string = getConfiguredBackendUrl()): string {
  return new URL(`desktop/api/apps/mcp/${encodeURIComponent(toolkit)}`, backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`).toString();
}

function app(connector: Omit<VendorMcpConnector, "url" | "appsToolkit" | "comingSoon">, toolkit: string): VendorMcpConnector {
  return { ...connector, appsToolkit: toolkit, get url() { return appsMcpUrl(toolkit); } };
}

const G = VENDOR_MCP_GROUP;

/**
 * Our store. Live cards are vendor-hosted remote MCP (http) that advertised
 * dynamic registration on 15 September and still answered here on 19 September.
 * Coming soon is everything the person will look for that cannot Connect yet:
 * no public MCP, or OAuth that needs an app we register. A vendor that
 * registers no clients but reads client metadata documents gets Simeon's, on
 * our server (13 October 2026, `oauth.ts`); Shopify's takes only the clients
 * it has approved, so Shopify stays with our apps service for now.
 */
export const VENDOR_MCP_CONNECTORS: readonly VendorMcpConnector[] = [
  app({ id: "gmail", name: "Gmail", category: G.MailCalendar, description: "Search, read, draft, and manage email." }, "gmail"),
  app({ id: "outlook", name: "Outlook", category: G.MailCalendar, description: "Mail and Microsoft 365 calendar." }, "outlook"),
  app({ id: "google-calendar", name: "Google Calendar", category: G.MailCalendar, description: "Search events and schedule meetings." }, "googlecalendar"),
  { id: "notion", name: "Notion", category: G.FilesDocs, url: "https://mcp.notion.com/mcp", description: "Search, read, and write pages and databases." },
  app({ id: "google-drive", name: "Google Drive", category: G.FilesDocs, description: "Search, read, create, and share files." }, "googledrive"),
  { id: "dropbox", name: "Dropbox", category: G.FilesDocs, url: "https://mcp.dropbox.com/mcp", loopbackOnly: true, description: "Search, read, and organise files." },
  { id: "airtable", name: "Airtable", category: G.Productivity, url: "https://mcp.airtable.com/mcp", description: "Query and update bases, tables, and records." },
  { id: "asana", name: "Asana", category: G.Productivity, url: "https://mcp.asana.com/mcp", description: "Search and update tasks and projects." },
  { id: "clickup", name: "ClickUp", category: G.Productivity, url: "https://mcp.clickup.com/mcp", description: "Tasks, docs, and spaces." },
  { id: "monday", name: "monday.com", category: G.Productivity, url: "https://mcp.monday.com/mcp", description: "Boards, items, and the week." },
  { id: "todoist", name: "Todoist", category: G.Productivity, url: "https://ai.todoist.net/mcp", description: "Create, find, and complete tasks and projects." },
  app({ id: "zoom", name: "Zoom", category: G.Meetings, description: "Search meetings, pull transcripts, and work with Zoom Docs." }, "zoom"),
  app({ id: "google-meet", name: "Google Meet", category: G.Meetings, description: "Meetings and recordings in Google." }, "googlemeet"),
  app({ id: "figma", name: "Figma", category: G.Creativity, description: "Read files, frames, and design context." }, "figma"),
  { id: "canva", name: "Canva", category: G.Creativity, url: "https://mcp.canva.com/mcp", loopbackOnly: true, description: "Create and edit designs." },
  { id: "miro", name: "Miro", category: G.Creativity, url: "https://mcp.miro.com/mcp", description: "Read and build boards." },
  { id: "webflow", name: "Webflow", category: G.Creativity, url: "https://mcp.webflow.com/mcp", description: "Sites, CMS, and collections." },
  { id: "wix", name: "Wix", category: G.Creativity, url: "https://mcp.wix.com/mcp", description: "Sites and the Wix collection." },
  { id: "stripe", name: "Stripe", category: G.Finance, url: "https://mcp.stripe.com", description: "Customers, payments, subscriptions, and invoices." },
  { id: "paypal", name: "PayPal", category: G.Finance, url: "https://mcp.paypal.com/mcp", description: "Invoices, orders, and transactions." },
  { id: "square", name: "Square", category: G.Finance, url: "https://mcp.squareup.com/mcp", loopbackOnly: true, description: "Payments, catalog, and the shop." },
  { id: "ramp", name: "Ramp", category: G.Finance, url: "https://mcp.ramp.com/mcp", description: "Expenses, cards, bills, and reimbursements." },
  app({ id: "quickbooks", name: "QuickBooks", category: G.Finance, description: "Books, invoices, and expenses." }, "quickbooks"),
  app({ id: "hubspot", name: "HubSpot", category: G.Sales, description: "Search and update contacts, companies, deals, and tickets." }, "hubspot"),
  app({ id: "salesforce", name: "Salesforce", category: G.Sales, description: "Leads, accounts, opportunities, and cases." }, "salesforce"),
  { id: "intercom", name: "Intercom", category: G.Sales, url: "https://mcp.intercom.com/mcp", description: "Search conversations, contacts, and Help Center articles." },
  { id: "apollo", name: "Apollo", category: G.Sales, url: "https://mcp.apollo.io/mcp", description: "People, accounts, and sequences." },
  { id: "linear", name: "Linear", category: G.Developer, url: "https://mcp.linear.app/mcp", description: "Issues, projects, and cycles." },
  { id: "jira", name: "Jira", category: G.Developer, url: "https://mcp.atlassian.com/v1/mcp", description: "Jira and Confluence, through Atlassian." },
  app({ id: "github", name: "GitHub", category: G.Developer, description: "Manage repos, issues, pull requests, and Actions." }, "github"),
  { id: "vercel", name: "Vercel", category: G.Developer, url: "https://mcp.vercel.com", loopbackOnly: true, description: "Projects, deployments, and logs." },
  { id: "supabase", name: "Supabase", category: G.Developer, url: "https://mcp.supabase.com/mcp", description: "Projects, tables, and SQL." },
  { id: "sentry", name: "Sentry", category: G.Developer, url: "https://mcp.sentry.dev/mcp", description: "Errors, releases, and performance." },
  { id: "cloudflare", name: "Cloudflare", category: G.Developer, url: "https://bindings.mcp.cloudflare.com/mcp", description: "Workers, KV, and bindings." },
  app({ id: "mailchimp", name: "Mailchimp", category: G.Marketing, description: "Audiences, campaigns, and automations." }, "mailchimp"),
  { id: "greenhouse", name: "Greenhouse", category: G.Hiring, url: "https://mcp.greenhouse.io/mcp", description: "Jobs, candidates, and the pipeline." },
  app({ id: "gusto", name: "Gusto", category: G.Hiring, description: "Payroll, people, and time off." }, "gusto"),
  app({ id: "slack", name: "Slack", category: G.Social, description: "Read and send messages in channels and DMs." }, "slack"),
  app({ id: "linkedin", name: "LinkedIn", category: G.Social, description: "Post to LinkedIn and read your own profile. Not the feed or messages." }, "linkedin"),
  // Appended, never inserted: a connector's server id is its place in this list.
  app({ id: "google-docs", name: "Google Docs", category: G.FilesDocs, description: "Read and write documents." }, "googledocs"),
  app({ id: "google-sheets", name: "Google Sheets", category: G.FilesDocs, description: "Read and write spreadsheets." }, "googlesheets"),
  app({ id: "google-slides", name: "Google Slides", category: G.FilesDocs, description: "Read and build presentations." }, "googleslides"),
  app({ id: "onedrive", name: "OneDrive", category: G.FilesDocs, description: "Files in Microsoft 365." }, "one_drive"),
  app({ id: "google-tasks", name: "Google Tasks", category: G.Productivity, description: "Tasks and lists in Google." }, "googletasks"),
  app({ id: "trello", name: "Trello", category: G.Productivity, description: "Boards, lists, and cards." }, "trello"),
  app({ id: "xero", name: "Xero", category: G.Finance, description: "Read and write invoices, contacts, reports, and payroll." }, "xero"),
  app({ id: "shopify", name: "Shopify", category: G.Finance, description: "Orders, products, customers, and your store." }, "shopify"),
  app({ id: "brex", name: "Brex", category: G.Finance, description: "Query expenses, receipts, bills, cards, and travel." }, "brex"),
  app({ id: "pipedrive", name: "Pipedrive", category: G.Sales, description: "Deals, people, and the pipeline." }, "pipedrive"),
  app({ id: "docusign", name: "Docusign", category: G.Sales, description: "Manage envelopes, templates, workflows, and agreements." }, "docusign"),
  { id: "klaviyo", name: "Klaviyo", category: G.Marketing, url: "https://mcp.klaviyo.com/mcp", description: "Manage profiles, segments, campaigns, and flows." },
  { id: "ashby", name: "Ashby", category: G.Hiring, url: "https://mcp.ashbyhq.com/mcp/v1", description: "Search candidates, prep interviews, and manage pipeline tasks." },
  // 3 October 2026, for founders and small businesses ("we're selling to
  // founders"): each one checked that day against Composio's toolkit page
  // (Composio-managed sign-in, so Add works without an app of ours) or, for
  // Mercury and PostHog, against the vendor's own MCP server (401 to an
  // unsigned initialize, OAuth metadata with a registration endpoint and S256).
  app({ id: "google-analytics", name: "Google Analytics", category: G.Marketing, description: "Traffic, conversions, and GA4 reports." }, "google_analytics"),
  app({ id: "google-search-console", name: "Google Search Console", category: G.Marketing, description: "Search queries, clicks, and indexing for your site." }, "google_search_console"),
  app({ id: "youtube", name: "YouTube", category: G.Marketing, description: "Your channel's videos, playlists, and stats." }, "youtube"),
  app({ id: "kit", name: "Kit", category: G.Marketing, description: "Newsletter subscribers, tags, and broadcasts (ConvertKit)." }, "kit"),
  app({ id: "instagram", name: "Instagram", category: G.Social, description: "Posts, comments, messages, and insights. Business and Creator accounts." }, "instagram"),
  app({ id: "facebook", name: "Facebook Pages", category: G.Social, description: "Your Pages' posts, comments, messages, and insights." }, "facebook"),
  { id: "calendly", name: "Calendly", category: G.Meetings, url: "https://mcp.calendly.com/", description: "Booking links, scheduled meetings, and invitees." },
  { id: "cal-com", name: "Cal.com", category: G.Meetings, url: "https://mcp.cal.com/mcp", description: "Bookings, event types, and availability." },
  { id: "attio", name: "Attio", category: G.Sales, url: "https://mcp.attio.com/mcp", description: "People, companies, deals, and lists in your CRM." },
  app({ id: "zendesk", name: "Zendesk", category: G.Sales, description: "Support tickets, customers, and help center." }, "zendesk"),
  app({ id: "microsoft-teams", name: "Microsoft Teams", category: G.Social, description: "Chats, channels, and meetings in Teams." }, "microsoft_teams"),
  app({ id: "discord", name: "Discord", category: G.Social, description: "Your servers, channels, and invites." }, "discord"),
  { id: "mercury", name: "Mercury", category: G.Finance, url: "https://mcp.mercury.com/mcp", description: "Business bank accounts, balances, and transactions. Read-only." },
  { id: "posthog", name: "PostHog", category: G.Developer, url: "https://mcp.posthog.com/mcp", description: "Product analytics, insights, and feature flags." },
  // 7 October 2026, the founder's hand-picked list: only the toolkits whose
  // Composio page marks the sign-in as Composio-managed OAuth, so Add works
  // in one click. The rest of that list asks for the person's own API key or
  // an OAuth app of ours (X, Spotify, Meta Ads, LinkedIn Ads) and waits.
  app({ id: "google-ads", name: "Google Ads", category: G.Marketing, description: "Campaigns, ad groups, keywords, and performance." }, "googleads"),
  app({ id: "tiktok-ads", name: "TikTok Ads", category: G.Marketing, description: "Campaigns, ads, audiences, and reports." }, "tiktok_ads"),
  app({ id: "microsoft-excel", name: "Excel", category: G.FilesDocs, description: "Read and write workbooks in Microsoft 365." }, "excel"),
  app({ id: "reddit", name: "Reddit", category: G.Social, description: "Search posts and comments, and post to communities." }, "reddit"),
  app({ id: "pinterest", name: "Pinterest", category: G.Social, description: "Boards, pins, and their analytics." }, "pinterest"),
  app({ id: "gumroad", name: "Gumroad", category: G.Finance, description: "Products, sales, and subscribers." }, "gumroad"),
  app({ id: "google-classroom", name: "Google Classroom", category: G.Learning, description: "Courses, assignments, students, and grades." }, "google_classroom"),
  { id: "gorgias", name: "Gorgias", category: G.Sales, url: "https://mcp.gorgias.com/mcp", description: "Support tickets, customers, and replies for your store." },
  app({ id: "zoho-desk", name: "Zoho Desk", category: G.Sales, description: "Support tickets, contacts, and agents." }, "zoho_desk"),
  app({ id: "zoho-bigin", name: "Bigin by Zoho", category: G.Sales, description: "Contacts, deals, and pipelines in a small-business CRM." }, "zoho_bigin"),
  { id: "gong", name: "Gong", category: G.Sales, url: "https://mcp.gong.io/mcp", description: "Sales calls, transcripts, and deal insights." },
  app({ id: "capsule-crm", name: "Capsule", category: G.Sales, description: "Contacts, opportunities, and tasks in your CRM." }, "capsule_crm"),
  app({ id: "dialpad", name: "Dialpad", category: G.Sales, description: "Calls, texts, contacts, and call summaries." }, "dialpad"),
  // 13 October 2026, the founder: "add stripe/link-cli so that the agents can
  // make purchase for the user … and access their banks". Run on the cloud
  // computer (`boxCli`); purchases for US and Canadian Link accounts, bank
  // reading for US ones.
  { id: "link", name: "Link", category: G.Finance, url: "https://link.com/agents", boxCli: "link", description: "Buy what you ask for, with your OK in the Link app for each purchase, and read the bank accounts you share. US only." },
  // 13 October 2026, the founder ("there are plenty of MCPs out there"): two
  // apps on their makers' own servers, probed that day (401 with OAuth
  // metadata, open registration, S256). Asana, Todoist, Intercom, Klaviyo,
  // Ashby, Calendly, Cal.com, Attio, Gorgias and Gong moved from our apps
  // service to theirs in place, the same day (`installs.ts` moves an install
  // made through our apps service to the new address).
  { id: "granola", name: "Granola", category: G.Meetings, url: "https://mcp.granola.ai/mcp", description: "Your meeting notes, transcripts, and folders." },
  { id: "resend", name: "Resend", category: G.Developer, url: "https://mcp.resend.com", description: "Send email, and manage domains, audiences, and broadcasts." },
  // 13 October 2026, the founder ("add those microsoft suite ones basically. add lovable"): SharePoint through our apps service
  // (Composio signs anyone in); OneNote and Microsoft To Do need Simeon Labs' own Microsoft app first (`OWN_APP_NEEDED`), so they
  // say "Coming soon" until it is named; Lovable on its own server, which takes a hosted sign-in address only once Lovable approves
  // it and the loopback always (docs.lovable.dev, "Lovable MCP server"). Word and PowerPoint have no app of their own anywhere:
  // their files are OneDrive's and SharePoint's.
  app({ id: "sharepoint", name: "SharePoint", category: G.FilesDocs, description: "Sites, lists, and files in Microsoft 365." }, "share_point"),
  app({ id: "onenote", name: "OneNote", category: G.FilesDocs, description: "Notebooks, sections, and pages." }, "onenote"),
  app({ id: "microsoft-to-do", name: "Microsoft To Do", category: G.Productivity, description: "Your tasks and lists in Microsoft To Do." }, "microsoft_todo"),
  { id: "lovable", name: "Lovable", category: G.Developer, url: "https://mcp.lovable.dev", loopbackOnly: true, description: "Build and change apps and sites by describing them." },
  // 14 October 2026, the founder ("build the whole shop integration. make sure its the exact flow as link"): Shop, run from the
  // cloud computer (`boxCli`) against Shop MCP, the person's Shop sign-in kept there. Shopping search works without it.
  { id: "shop", name: "Shop", category: G.Finance, url: "https://shop.app", boxCli: "shop", description: "Find products across Shopify stores and buy them with your Shop card, with your OK for each purchase. Track your orders." },
  // 17 October 2026, the founder ("a lot more connectors … the best out there, most famous for each category"): the 36 whose
  // Composio toolkit page says "Composio-managed OAuth available? Yes", so Add works in one tap, read from Composio's toolkit
  // pages that day. NotebookLM's is NotebookLM Enterprise (a licensed Google Cloud project), and WhatsApp's is WhatsApp Business.
  app({ id: "whatsapp", name: "WhatsApp", category: G.Social, description: "Messages and templates on your WhatsApp Business account. Not personal WhatsApp." }, "whatsapp"),
  app({ id: "twitch", name: "Twitch", category: G.Social, description: "Your channel, streams, clips, and chat." }, "twitch"),
  app({ id: "reddit-ads", name: "Reddit Ads", category: G.Marketing, description: "Campaigns, ad groups, ads, and reports." }, "reddit_ads"),
  app({ id: "pinterest-ads", name: "Pinterest Ads", category: G.Marketing, description: "Campaigns, ad groups, and their results." }, "pinterest_ads"),
  app({ id: "omnisend", name: "Omnisend", category: G.Marketing, description: "Contacts, campaigns, and automations for your store's email and SMS." }, "omnisend"),
  app({ id: "dub", name: "Dub", category: G.Marketing, description: "Short links, QR codes, and click analytics." }, "dub"),
  app({ id: "eventbrite", name: "Eventbrite", category: G.Marketing, description: "Your events, tickets, orders, and attendees." }, "eventbrite"),
  app({ id: "google-photos", name: "Google Photos", category: G.Creativity, description: "Find, upload, and share photos and albums." }, "googlephotos"),
  app({ id: "mural", name: "Mural", category: G.Creativity, description: "Workspaces, murals, and the sticky notes on them." }, "mural"),
  app({ id: "zeplin", name: "Zeplin", category: G.Creativity, description: "Projects, screens, components, and style guides." }, "zeplin"),
  app({ id: "contentful", name: "Contentful", category: G.Creativity, description: "Spaces, content types, and entries in your CMS." }, "contentful"),
  app({ id: "box", name: "Box", category: G.FilesDocs, description: "Search, read, and share files and folders." }, "box"),
  app({ id: "confluence", name: "Confluence", category: G.FilesDocs, description: "Search, read, and write spaces and pages." }, "confluence"),
  app({ id: "notebooklm", name: "NotebookLM", category: G.FilesDocs, description: "Notebooks, sources, and audio overviews in NotebookLM Enterprise. Not the free NotebookLM." }, "notebook_lm"),
  app({ id: "basecamp", name: "Basecamp", category: G.Productivity, description: "Projects, to-dos, messages, and schedules." }, "basecamp"),
  app({ id: "wrike", name: "Wrike", category: G.Productivity, description: "Tasks, projects, and folders." }, "wrike"),
  app({ id: "ticktick", name: "TickTick", category: G.Productivity, description: "Tasks, lists, and due dates." }, "ticktick"),
  app({ id: "harvest", name: "Harvest", category: G.Productivity, description: "Time entries, projects, clients, and invoices." }, "harvest"),
  app({ id: "typeform", name: "Typeform", category: G.Productivity, description: "Forms and their responses." }, "typeform"),
  app({ id: "productboard", name: "Productboard", category: G.Productivity, description: "Features, notes, and customer feedback." }, "productboard"),
  app({ id: "google-maps", name: "Google Maps", category: G.Productivity, description: "Places, directions, and travel times." }, "google_maps"),
  app({ id: "webex", name: "Webex", category: G.Meetings, description: "Meetings, recordings, and messages." }, "webex"),
  app({ id: "fathom", name: "Fathom", category: G.Meetings, description: "Your recorded meetings, summaries, and transcripts." }, "fathom"),
  app({ id: "zoho-mail", name: "Zoho Mail", category: G.MailCalendar, description: "Search, read, and send email." }, "zoho_mail"),
  app({ id: "freshbooks", name: "FreshBooks", category: G.Finance, description: "Invoices, clients, expenses, and time." }, "freshbooks"),
  app({ id: "zoho-books", name: "Zoho Books", category: G.Finance, description: "Invoices, bills, contacts, and your books." }, "zoho_books"),
  app({ id: "ynab", name: "YNAB", category: G.Finance, description: "Budgets, accounts, and transactions (You Need A Budget)." }, "ynab"),
  app({ id: "splitwise", name: "Splitwise", category: G.Finance, description: "Shared expenses, groups, and who owes whom." }, "splitwise"),
  app({ id: "shippo", name: "Shippo", category: G.Finance, description: "Shipping rates, labels, and tracking." }, "shippo"),
  app({ id: "zoho-crm", name: "Zoho CRM", category: G.Sales, description: "Leads, contacts, deals, and accounts." }, "zoho"),
  app({ id: "dynamics-365", name: "Dynamics 365", category: G.Sales, description: "Leads, accounts, contacts, and opportunities in Microsoft Dynamics." }, "dynamics365"),
  app({ id: "gitlab", name: "GitLab", category: G.Developer, description: "Projects, issues, merge requests, and pipelines." }, "gitlab"),
  app({ id: "bitbucket", name: "Bitbucket", category: G.Developer, description: "Repositories, pull requests, and pipelines." }, "bitbucket"),
  app({ id: "pagerduty", name: "PagerDuty", category: G.Developer, description: "Incidents, on-call schedules, and services." }, "pagerduty"),
  app({ id: "google-bigquery", name: "Google BigQuery", category: G.Developer, description: "Datasets and tables, and the SQL to query them." }, "googlebigquery"),
  app({ id: "hugging-face", name: "Hugging Face", category: G.Developer, description: "Models, datasets, and Spaces." }, "hugging_face"),
  // The same day, 17 apps on their makers' own MCP servers, each probed then: a 401 naming OAuth metadata, an open
  // registration endpoint and S256, and a registration of Simeon with the hosted return address (Gamma refused it and took
  // the loopback, so it is loopback-only, as Canva is). Excalidraw's answers its tools to anyone (`noSignIn`). Plaid's
  // is Plaid's dashboard for teams building on Plaid, not a person's bank accounts (Link reads those).
  { id: "excalidraw", name: "Excalidraw", category: G.Creativity, url: "https://mcp.excalidraw.com/mcp", noSignIn: true, description: "Draw hand-drawn diagrams, and share them on excalidraw.com." },
  { id: "heygen", name: "HeyGen", category: G.Creativity, url: "https://mcp.heygen.com/mcp/v1/", description: "Make videos with AI avatars and voices." },
  { id: "higgsfield", name: "Higgsfield", category: G.Creativity, url: "https://mcp.higgsfield.ai/mcp", description: "Generate images and videos with AI models." },
  { id: "gamma", name: "Gamma", category: G.Creativity, url: "https://mcp.gamma.app/mcp", loopbackOnly: true, description: "Make presentations, documents, and web pages." },
  { id: "descript", name: "Descript", category: G.Creativity, url: "https://api.descript.com/v2/mcp", description: "Edit video and podcasts: import media, run edits, export." },
  { id: "lucid", name: "Lucid", category: G.Creativity, url: "https://mcp.lucid.app/mcp", description: "Diagrams and whiteboards in Lucidchart and Lucidspark." },
  { id: "eraser", name: "Eraser", category: G.Creativity, url: "https://app.eraser.io/api/mcp", description: "Technical diagrams and docs." },
  { id: "mobbin", name: "Mobbin", category: G.Creativity, url: "https://api.mobbin.com/mcp", description: "Search real apps' screens and flows for design ideas." },
  { id: "magic-patterns", name: "Magic Patterns", category: G.Creativity, url: "https://mcp.magicpatterns.com/mcp", description: "Design and change app screens by describing them." },
  { id: "pandadoc", name: "PandaDoc", category: G.FilesDocs, url: "https://mcp.pandadoc.com/v1/mcp", description: "Proposals, quotes, and contracts: create, send, and track." },
  { id: "otter", name: "Otter.ai", category: G.Meetings, url: "https://mcp.otter.ai/mcp", description: "Your meeting transcripts and summaries. Read-only." },
  { id: "read-ai", name: "Read AI", category: G.Meetings, url: "https://api.read.ai/mcp", description: "Meeting summaries, transcripts, and action items." },
  { id: "fellow", name: "Fellow", category: G.Meetings, url: "https://fellow.app/mcp", description: "Meeting notes, action items, and agendas." },
  { id: "plaid", name: "Plaid", category: G.Finance, url: "https://api.dashboard.plaid.com/mcp/", description: "Your Plaid integration's Items, Link conversion, and usage. For teams building on Plaid. Read-only." },
  { id: "clay", name: "Clay", category: G.Sales, url: "https://api.clay.com/v3/mcp", description: "Research companies and people, and enrich your lists." },
  { id: "netlify", name: "Netlify", category: G.Developer, url: "https://netlify-mcp.netlify.app/mcp", description: "Sites, deploys, and environment settings." },
  { id: "neon", name: "Neon", category: G.Developer, url: "https://mcp.neon.tech/mcp", description: "Postgres projects, branches, and SQL." },
];

const byId = new Map(VENDOR_MCP_CONNECTORS.map((item) => [item.id, item]));

export function vendorMcpConnectorById(id: string): VendorMcpConnector | undefined {
  return byId.get(id.trim());
}

export function isVendorMcpPluginId(id: string): boolean {
  return vendorMcpConnectorById(id) != null;
}

export function isVendorMcpComingSoon(id: string): boolean {
  return vendorMcpConnectorById(id)?.comingSoon === true;
}

/**
 * The MCP manager validates every server id as a positive decimal string
 * (`mcp-server-id.ts`), because the upstream's backend numbered its servers. A
 * vendor connector gets a stable number from its place in the store, far
 * above anything a real account ever held; the plugin id stays the
 * server *identifier* ("figma"), which is what tools and the box use.
 */
export const VENDOR_MCP_SERVER_ID_BASE = 900_000;

export function vendorMcpServerId(pluginId: string): string | undefined {
  const index = VENDOR_MCP_CONNECTORS.findIndex((item) => item.id === pluginId.trim());
  return index < 0 ? undefined : String(VENDOR_MCP_SERVER_ID_BASE + index + 1);
}

export function vendorMcpPluginIdForServerId(serverId: string | number): string | undefined {
  const numeric = typeof serverId === "number" ? serverId : Number(String(serverId).trim());
  if (!Number.isSafeInteger(numeric)) return undefined;
  const index = numeric - VENDOR_MCP_SERVER_ID_BASE - 1;
  return index >= 0 && index < VENDOR_MCP_CONNECTORS.length ? VENDOR_MCP_CONNECTORS[index]?.id : undefined;
}
