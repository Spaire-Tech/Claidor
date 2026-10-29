import Foundation

/**
 * A connector page's own words and links, the iPhone's and the Mac's (the
 * founder, 29 October 2026, after ChatGPT's plugin pages): who makes it, a
 * few lines on what an agent does with it, three messages a person might
 * send their agent naming it (shown on the page's card, the name in its
 * colour with its logo as in a chat; they do nothing when tapped), and its
 * maker's site, privacy policy and terms, each link opened and checked when
 * written. The most-used connectors first; one without a page keeps its
 * catalog line.
 */
public struct ConnectorPage: Sendable, Equatable {
  public let maker: String
  public let about: String
  public let examples: [String]
  public let website: URL?
  public let privacy: URL?
  public let terms: URL?

  /** The page of a catalog entry (its id, as `gmail`), in the app's language. */
  public static func page(for id: String) -> ConnectorPage? {
    switch id {
    case "gmail":
      return page("Google", site: "https://workspace.google.com/products/gmail/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents search and read your email in Gmail, summarize long threads, and draft replies for you to check before anything is sent."),
        L10n.text("Summarize the last five emails from my accountant in Gmail and list what needs a reply."),
        L10n.text("Draft a polite reply in Gmail to the latest invoice email, asking for a new due date."),
        L10n.text("Find every Gmail thread about the lease this month and pull out the key dates."))
    case "google-calendar":
      return page("Google", site: "https://workspace.google.com/products/calendar/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents read your Google Calendar, find free time, and schedule or move meetings for you."),
        L10n.text("Find a free hour next week in Google Calendar for a call with Sam and send the invite."),
        L10n.text("What’s on my Google Calendar tomorrow, and which meetings could move?"),
        L10n.text("Block two hours of focus time every morning this week in Google Calendar."))
    case "google-drive":
      return page("Google", site: "https://workspace.google.com/products/drive/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents find, read, and create files in Google Drive, and share them with the people you name."),
        L10n.text("Find the latest budget sheet in Google Drive and tell me what changed since last month."),
        L10n.text("Put this week’s meeting notes in a new doc in Google Drive and share it with the team."),
        L10n.text("List the files in Google Drive I haven’t opened in a year, so I can clean up."))
    case "outlook":
      return page("Microsoft", site: "https://www.microsoft.com/microsoft-365/outlook", privacy: "https://privacy.microsoft.com/privacystatement", terms: "https://www.microsoft.com/servicesagreement",
        about: L10n.text("Your agents read and sort your email in Outlook, draft replies, and keep your Microsoft 365 calendar up to date."),
        L10n.text("Go through my Outlook inbox and flag anything from clients that’s still waiting on me."),
        L10n.text("Reply in Outlook to Jordan’s last email and suggest Thursday at 10 instead."),
        L10n.text("Find the contract someone sent me in Outlook last month and summarize it."))
    case "slack":
      return page("Slack", site: "https://slack.com", privacy: "https://slack.com/trust/privacy/privacy-policy", terms: "https://slack.com/main-services-agreement",
        about: L10n.text("Your agents read your channels and messages in Slack, catch you up, and post for you when you ask."),
        L10n.text("Catch me up on #marketing in Slack since Monday, in five points."),
        L10n.text("Post the launch checklist in Slack and ask who can take each item."),
        L10n.text("Find what the team decided about pricing in Slack last week."))
    case "notion":
      return page("Notion", site: "https://www.notion.com", privacy: "https://www.notion.so/notion/Privacy-Policy-3468d120cf614d4c9014c09f6adc9091", terms: "https://www.notion.so/notion/Terms-and-Privacy-28ffdd083dc3473e9c2da6ec011b58ac",
        about: L10n.text("Your agents search, read, and write your pages and databases in Notion."),
        L10n.text("Turn these notes into a project page in Notion with owners and due dates."),
        L10n.text("Find our onboarding checklist in Notion and tell me what’s out of date."),
        L10n.text("Add today’s sales calls to our CRM database in Notion."))
    case "github":
      return page("GitHub", site: "https://github.com", privacy: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement", terms: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
        about: L10n.text("Your agents work in your repositories on GitHub: they read code, open issues, and review pull requests."),
        L10n.text("Summarize the open pull requests on GitHub that are waiting on my review."),
        L10n.text("Open an issue on GitHub for the login bug, with the steps to reproduce it."),
        L10n.text("What shipped in our GitHub repo this week? Write it up as release notes."))
    case "linear":
      return page("Linear", site: "https://linear.app", privacy: "https://linear.app/privacy", terms: "https://linear.app/terms",
        about: L10n.text("Your agents create and update issues in Linear and tell you where your projects and cycles stand."),
        L10n.text("Create Linear issues for each bug in this list and assign them to me."),
        L10n.text("What’s left in the current cycle in Linear, and what’s at risk?"),
        L10n.text("Move every Linear issue I finished today to Done."))
    case "dropbox":
      return page("Dropbox", site: "https://www.dropbox.com", privacy: "https://www.dropbox.com/privacy", terms: "https://www.dropbox.com/terms",
        about: L10n.text("Your agents find, read, and organize your files in Dropbox."),
        L10n.text("Find the signed lease in Dropbox and tell me when it ends."),
        L10n.text("Make a folder in Dropbox for the Smith project and put these files in it."),
        L10n.text("List what takes the most space in my Dropbox."))
    case "hubspot":
      return page("HubSpot", site: "https://www.hubspot.com", privacy: "https://legal.hubspot.com/privacy-policy", terms: "https://legal.hubspot.com/terms-of-service",
        about: L10n.text("Your agents look up and update your contacts, companies, and deals in HubSpot."),
        L10n.text("Find the deals in HubSpot that haven’t moved in two weeks and draft a follow-up for each."),
        L10n.text("Add the people from today’s event to HubSpot as contacts."),
        L10n.text("Sum up what we know about Acme in HubSpot before my call."))
    case "airtable":
      return page("Airtable", site: "https://www.airtable.com", privacy: "https://www.airtable.com/company/privacy", terms: "https://www.airtable.com/company/tos",
        about: L10n.text("Your agents look up, add, and update the records in your Airtable bases."),
        L10n.text("Add these five new leads to our sales base in Airtable."),
        L10n.text("Which projects in Airtable are past their due date?"),
        L10n.text("Update the status of every order in Airtable that shipped today."))
    case "asana":
      return page("Asana", site: "https://asana.com", privacy: "https://asana.com/terms/privacy-statement", terms: "https://asana.com/terms/terms-of-service",
        about: L10n.text("Your agents find, create, and update tasks and projects in Asana."),
        L10n.text("What’s due this week across my projects in Asana?"),
        L10n.text("Create Asana tasks from these meeting notes and assign each one."),
        L10n.text("Mark the launch tasks I finished today as done in Asana."))
    case "clickup":
      return page("ClickUp", site: "https://clickup.com", privacy: "https://clickup.com/terms/privacy", terms: "https://clickup.com/terms",
        about: L10n.text("Your agents work with your tasks, docs, and spaces in ClickUp."),
        L10n.text("List my overdue tasks in ClickUp, most urgent first."),
        L10n.text("Turn this brief into a doc in ClickUp and share it with the design team."),
        L10n.text("Create a ClickUp task for each item in this checklist."))
    case "monday":
      return page("monday.com", site: "https://monday.com", privacy: "https://monday.com/l/privacy/privacy-policy/", terms: "https://monday.com/l/legal/tos/",
        about: L10n.text("Your agents read and update your boards and items on monday.com, and tell you what’s coming up this week."),
        L10n.text("What’s on my plate this week on monday.com?"),
        L10n.text("Add an item on monday.com for the Smith renovation, due Friday."),
        L10n.text("Move every item on monday.com that’s waiting on the client to Stuck."))
    case "todoist":
      return page("Doist", site: "https://www.todoist.com", privacy: "https://www.todoist.com/privacy", terms: "https://www.todoist.com/terms-of-service",
        about: L10n.text("Your agents add, find, and complete your tasks and projects in Todoist."),
        L10n.text("Add “call the bank” to Todoist for tomorrow at 9."),
        L10n.text("What’s left on my Todoist list for today?"),
        L10n.text("Move everything in my Todoist inbox into the right projects."))
    case "zoom":
      return page("Zoom", site: "https://www.zoom.com", privacy: "https://www.zoom.com/en/trust/privacy/privacy-statement/", terms: "https://www.zoom.com/en/trust/terms/",
        about: L10n.text("Your agents find your meetings in Zoom, pull their transcripts, and work with your Zoom Docs."),
        L10n.text("Summarize yesterday’s call with the investors from Zoom and list the follow-ups."),
        L10n.text("Find what we agreed on pricing in last week’s Zoom meetings."),
        L10n.text("Turn the notes from my last Zoom meeting into a doc."))
    case "google-meet":
      return page("Google", site: "https://workspace.google.com/products/meet/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents find your meetings and recordings in Google Meet and turn them into notes and next steps."),
        L10n.text("Summarize this morning’s Google Meet call and list who owes what."),
        L10n.text("Find the Google Meet recording of the design review and pull out the decisions."),
        L10n.text("Set up a Google Meet for tomorrow at 3 with Alex and Priya."))
    case "figma":
      return page("Figma", site: "https://www.figma.com", privacy: "https://www.figma.com/legal/privacy/", terms: "https://www.figma.com/legal/tos/",
        about: L10n.text("Your agents read your Figma files, frames, and design context, so they can describe a design or check it against the spec."),
        L10n.text("Describe the onboarding screens in Figma and list anything missing from the spec."),
        L10n.text("Pull the colours and type styles from our design system in Figma."),
        L10n.text("Compare the checkout frames in Figma with the live page and list the differences."))
    case "canva":
      return page("Canva", site: "https://www.canva.com", privacy: "https://www.canva.com/policies/privacy-policy/", terms: "https://www.canva.com/policies/terms-of-use/",
        about: L10n.text("Your agents create and edit your designs in Canva."),
        L10n.text("Make an Instagram post in Canva announcing our spring sale."),
        L10n.text("Resize our event poster in Canva for a LinkedIn banner."),
        L10n.text("Create a one-page flyer in Canva from these notes."))
    case "miro":
      return page("Miro", site: "https://miro.com", privacy: "https://miro.com/legal/privacy-policy/", terms: "https://miro.com/legal/terms-of-service/",
        about: L10n.text("Your agents read your Miro boards and build new ones: sticky notes, diagrams, and plans."),
        L10n.text("Summarize the ideas on our brainstorm board in Miro."),
        L10n.text("Turn this process into a flowchart on a new Miro board."),
        L10n.text("Group the sticky notes on our retro board in Miro by theme."))
    case "webflow":
      return page("Webflow", site: "https://webflow.com", privacy: "https://webflow.com/legal/privacy", terms: "https://webflow.com/legal/terms",
        about: L10n.text("Your agents manage your sites, CMS, and collections in Webflow."),
        L10n.text("Add this blog post to our Webflow CMS as a draft."),
        L10n.text("List the pages on our Webflow site that have no meta description."),
        L10n.text("Update the prices in our Webflow product collection from this sheet."))
    case "wix":
      return page("Wix", site: "https://www.wix.com", privacy: "https://www.wix.com/about/privacy", terms: "https://www.wix.com/about/terms-of-use",
        about: L10n.text("Your agents manage your sites and collections on Wix."),
        L10n.text("Add these three products to my store on Wix."),
        L10n.text("Update the opening hours on my Wix site."),
        L10n.text("List the newest entries in our Wix collection."))
    case "stripe":
      return page("Stripe", site: "https://stripe.com", privacy: "https://stripe.com/privacy", terms: "https://stripe.com/legal/ssa",
        about: L10n.text("Your agents look up customers, payments, subscriptions, and invoices in Stripe."),
        L10n.text("How much did we take in Stripe this month compared with last month?"),
        L10n.text("Find the Stripe customer for lea@acme.com and show her last three payments."),
        L10n.text("Send a Stripe invoice to Acme for 40 hours at $120."))
    case "paypal":
      return page("PayPal", site: "https://www.paypal.com", privacy: "https://www.paypal.com/us/legalhub/paypal/privacy-full", terms: "https://www.paypal.com/us/legalhub/paypal/useragreement-full",
        about: L10n.text("Your agents send invoices and look up orders and transactions in PayPal."),
        L10n.text("Send a PayPal invoice to Jordan for $350 for the logo work."),
        L10n.text("List the PayPal payments I received this week."),
        L10n.text("Which PayPal invoices are still unpaid?"))
    case "square":
      return page("Block", site: "https://squareup.com", privacy: "https://squareup.com/us/en/legal/general/privacy", terms: "https://squareup.com/us/en/legal/general/ua",
        about: L10n.text("Your agents check your payments, catalog, and shop in Square."),
        L10n.text("How were sales in Square yesterday compared with last Saturday?"),
        L10n.text("Add the new seasonal latte to the catalog in Square at $5.50."),
        L10n.text("Which items in Square sold best this month?"))
    case "ramp":
      return page("Ramp", site: "https://ramp.com", privacy: "https://ramp.com/legal/privacy-policy", terms: "https://ramp.com/legal/platform-agreement",
        about: L10n.text("Your agents check expenses, cards, bills, and reimbursements in Ramp."),
        L10n.text("Which expenses in Ramp this month are missing receipts?"),
        L10n.text("How much has the team spent on software in Ramp this quarter?"),
        L10n.text("List the bills in Ramp that are due this week."))
    case "quickbooks":
      return page("Intuit", site: "https://quickbooks.intuit.com", privacy: "https://www.intuit.com/privacy/statement/", terms: "https://www.intuit.com/legal/terms/en-us/quickbooks/online/",
        about: L10n.text("Your agents work in your books in QuickBooks: invoices, expenses, and reports."),
        L10n.text("Create an invoice in QuickBooks for Acme for the October retainer."),
        L10n.text("Which customers in QuickBooks are more than 30 days overdue?"),
        L10n.text("What were my biggest expenses in QuickBooks last month?"))
    case "salesforce":
      return page("Salesforce", site: "https://www.salesforce.com", privacy: "https://www.salesforce.com/company/privacy/", terms: "https://www.salesforce.com/company/legal/agreements/",
        about: L10n.text("Your agents look up and update leads, accounts, opportunities, and cases in Salesforce."),
        L10n.text("Which opportunities in Salesforce close this month, and what’s their total?"),
        L10n.text("Log today’s call with Acme in Salesforce and set a follow-up for next Tuesday."),
        L10n.text("Find the open cases in Salesforce for our five biggest accounts."))
    case "intercom":
      return page("Intercom", site: "https://www.intercom.com", privacy: "https://www.intercom.com/legal/privacy", terms: "https://www.intercom.com/legal/terms-and-policies",
        about: L10n.text("Your agents search your conversations, contacts, and Help Center articles in Intercom."),
        L10n.text("What are customers asking about most in Intercom this week?"),
        L10n.text("Find the Intercom conversation with lea@acme.com and summarize it."),
        L10n.text("Which Help Center articles in Intercom still mention the old pricing?"))
    case "apollo":
      return page("Apollo.io", site: "https://www.apollo.io", privacy: "https://www.apollo.io/privacy-policy", terms: "https://www.apollo.io/terms",
        about: L10n.text("Your agents find people and accounts in Apollo and add them to your sequences."),
        L10n.text("Find heads of marketing at fintech companies in London in Apollo."),
        L10n.text("Add these ten contacts to our outreach sequence in Apollo."),
        L10n.text("Which accounts in Apollo opened our emails this week?"))
    case "jira":
      return page("Atlassian", site: "https://www.atlassian.com/software/jira", privacy: "https://www.atlassian.com/legal/privacy-policy", terms: "https://www.atlassian.com/legal/atlassian-customer-agreement",
        about: L10n.text("Your agents work in Jira and Confluence through Atlassian: issues, sprints, and pages."),
        L10n.text("What’s left in the current sprint in Jira?"),
        L10n.text("Create a bug in Jira for the checkout crash, with the steps to reproduce it."),
        L10n.text("Summarize our release process page in Confluence."))
    case "vercel":
      return page("Vercel", site: "https://vercel.com", privacy: "https://vercel.com/legal/privacy-policy", terms: "https://vercel.com/legal/terms",
        about: L10n.text("Your agents check your projects, deployments, and logs on Vercel."),
        L10n.text("Did the latest Vercel deployment of the website succeed?"),
        L10n.text("Show me the errors in the Vercel logs from the last hour."),
        L10n.text("Which of our Vercel projects haven’t been deployed in a month?"))
    case "supabase":
      return page("Supabase", site: "https://supabase.com", privacy: "https://supabase.com/privacy", terms: "https://supabase.com/terms",
        about: L10n.text("Your agents look at your Supabase projects, read your tables, and run SQL."),
        L10n.text("How many people signed up this week? Check the users table in Supabase."),
        L10n.text("Show me the slowest queries in our Supabase project."),
        L10n.text("Add a phone number column to the customers table in Supabase."))
    case "sentry":
      return page("Sentry", site: "https://sentry.io", privacy: "https://sentry.io/privacy/", terms: "https://sentry.io/terms/",
        about: L10n.text("Your agents look into errors, releases, and performance in Sentry."),
        L10n.text("What are the top new errors in Sentry since yesterday’s release?"),
        L10n.text("Find the Sentry issue behind the checkout crash and explain the cause."),
        L10n.text("Is the app slower in Sentry this week than last week?"))
    case "cloudflare":
      return page("Cloudflare", site: "https://www.cloudflare.com", privacy: "https://www.cloudflare.com/privacypolicy/", terms: "https://www.cloudflare.com/terms/",
        about: L10n.text("Your agents manage your Workers, KV, and bindings on Cloudflare."),
        L10n.text("List our Workers on Cloudflare and when each was last deployed."),
        L10n.text("What’s stored under the “config” key in our KV namespace on Cloudflare?"),
        L10n.text("Show me the routes bound to the api Worker on Cloudflare."))
    case "mailchimp":
      return page("Intuit", site: "https://mailchimp.com", privacy: "https://www.intuit.com/privacy/statement/", terms: "https://mailchimp.com/legal/terms/",
        about: L10n.text("Your agents work with your audiences, campaigns, and automations in Mailchimp."),
        L10n.text("How did last week’s newsletter do in Mailchimp?"),
        L10n.text("Add everyone who signed up at the event to our audience in Mailchimp."),
        L10n.text("Draft a campaign in Mailchimp announcing the new collection, ready for me to check."))
    case "greenhouse":
      return page("Greenhouse", site: "https://www.greenhouse.com", privacy: "https://www.greenhouse.com/privacy-policy", terms: "https://www.greenhouse.com/legal",
        about: L10n.text("Your agents look at your jobs, candidates, and pipeline in Greenhouse."),
        L10n.text("Which candidates in Greenhouse have waited more than a week for feedback?"),
        L10n.text("Summarize the interview notes in Greenhouse for the designer role."),
        L10n.text("How many people applied to each open job in Greenhouse this month?"))
    case "gusto":
      return page("Gusto", site: "https://gusto.com", privacy: "https://gusto.com/about/privacy", terms: "https://gusto.com/about/terms",
        about: L10n.text("Your agents check payroll, people, and time off in Gusto."),
        L10n.text("When is the next payroll in Gusto, and what’s the total?"),
        L10n.text("Who’s off next week according to Gusto?"),
        L10n.text("Show me Sam’s time off balance in Gusto."))
    case "linkedin":
      return page("LinkedIn", site: "https://www.linkedin.com", privacy: "https://www.linkedin.com/legal/privacy-policy", terms: "https://www.linkedin.com/legal/user-agreement",
        about: L10n.text("Your agents write and publish posts on LinkedIn for you and read your own profile. They don’t read your feed or your messages."),
        L10n.text("Write a LinkedIn post about our new hire and show it to me before posting."),
        L10n.text("Post this announcement on LinkedIn."),
        L10n.text("Check that my LinkedIn headline matches my new role."))
    case "google-docs":
      return page("Google", site: "https://workspace.google.com/products/docs/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents read and write your documents in Google Docs."),
        L10n.text("Summarize the proposal in Google Docs and list the open questions."),
        L10n.text("Write a first draft of the press release in Google Docs from these notes."),
        L10n.text("Fix the typos in our handbook in Google Docs."))
    case "google-sheets":
      return page("Google", site: "https://workspace.google.com/products/sheets/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents read and update your spreadsheets in Google Sheets."),
        L10n.text("Add this week’s sales to the tracker in Google Sheets."),
        L10n.text("Which items in our inventory in Google Sheets are below 10 units?"),
        L10n.text("Add a summary tab in Google Sheets with the totals by month."))
    case "google-slides":
      return page("Google", site: "https://workspace.google.com/products/slides/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents read your presentations in Google Slides and build new ones."),
        L10n.text("Turn this report into a ten-slide deck in Google Slides."),
        L10n.text("Summarize the board deck in Google Slides in five points."),
        L10n.text("Update the numbers on the revenue slide in Google Slides."))
    case "onedrive":
      return page("Microsoft", site: "https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage", privacy: "https://privacy.microsoft.com/privacystatement", terms: "https://www.microsoft.com/servicesagreement",
        about: L10n.text("Your agents find, read, and organize your files in OneDrive."),
        L10n.text("Find the latest version of the contract in OneDrive."),
        L10n.text("Move last year’s invoices into an archive folder in OneDrive."),
        L10n.text("Share the project folder in OneDrive with jordan@acme.com."))
    case "google-tasks":
      return page("Google", site: "https://workspace.google.com/products/tasks/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents add, find, and complete your tasks in Google Tasks."),
        L10n.text("Add “renew my passport” to Google Tasks for Friday."),
        L10n.text("What’s left on my list in Google Tasks?"),
        L10n.text("Mark the groceries task as done in Google Tasks."))
    case "trello":
      return page("Atlassian", site: "https://trello.com", privacy: "https://www.atlassian.com/legal/privacy-policy", terms: "https://www.atlassian.com/legal/atlassian-customer-agreement",
        about: L10n.text("Your agents work with your boards, lists, and cards in Trello."),
        L10n.text("Move the cards I finished today to Done in Trello."),
        L10n.text("Create a card in Trello for each item in this to-do list."),
        L10n.text("What’s in the Doing column on our Trello board?"))
    case "xero":
      return page("Xero", site: "https://www.xero.com", privacy: "https://www.xero.com/legal/privacy/", terms: "https://www.xero.com/legal/terms/",
        about: L10n.text("Your agents work with your invoices, contacts, reports, and payroll in Xero."),
        L10n.text("Which invoices in Xero are overdue, and by how much?"),
        L10n.text("Create an invoice in Xero for Acme for £2,400."),
        L10n.text("Show me last quarter’s profit and loss in Xero."))
    case "shopify":
      return page("Shopify", site: "https://www.shopify.com", privacy: "https://www.shopify.com/legal/privacy", terms: "https://www.shopify.com/legal/terms",
        about: L10n.text("Your agents look after your orders, products, and customers in Shopify."),
        L10n.text("How many orders came in on Shopify yesterday?"),
        L10n.text("Which products in Shopify are almost out of stock?"),
        L10n.text("Find the order in Shopify for lea@acme.com and tell me if it shipped."))
    case "brex":
      return page("Brex", site: "https://www.brex.com", privacy: "https://www.brex.com/legal/privacy", terms: "https://www.brex.com/legal/platform-agreement",
        about: L10n.text("Your agents look up expenses, receipts, bills, cards, and travel in Brex."),
        L10n.text("Which expenses in Brex this month are missing receipts?"),
        L10n.text("How much did we spend on travel in Brex last quarter?"),
        L10n.text("List the bills in Brex due before Friday."))
    case "pipedrive":
      return page("Pipedrive", site: "https://www.pipedrive.com", privacy: "https://www.pipedrive.com/en/privacy", terms: "https://www.pipedrive.com/en/terms-of-service",
        about: L10n.text("Your agents work with your deals, people, and pipeline in Pipedrive."),
        L10n.text("Which deals in Pipedrive have had no activity in two weeks?"),
        L10n.text("Add Jordan from Acme to Pipedrive and open a deal for $8,000."),
        L10n.text("What’s the total value of the deals in Pipedrive closing this month?"))
    case "docusign":
      return page("Docusign", site: "https://www.docusign.com", privacy: "https://www.docusign.com/privacy", terms: "https://www.docusign.com/legal/terms-and-conditions",
        about: L10n.text("Your agents manage your envelopes, templates, and agreements in Docusign."),
        L10n.text("Which envelopes in Docusign are still waiting for a signature?"),
        L10n.text("Send the NDA template in Docusign to jordan@acme.com."),
        L10n.text("Find the signed lease in Docusign and tell me when it ends."))
    case "klaviyo":
      return page("Klaviyo", site: "https://www.klaviyo.com", privacy: "https://www.klaviyo.com/legal/privacy", terms: "https://www.klaviyo.com/legal/terms-of-service",
        about: L10n.text("Your agents work with your profiles, segments, campaigns, and flows in Klaviyo."),
        L10n.text("How did last week’s campaign do in Klaviyo?"),
        L10n.text("Build a segment in Klaviyo of customers who haven’t ordered in 90 days."),
        L10n.text("Which flow in Klaviyo brings in the most revenue?"))
    case "ashby":
      return page("Ashby", site: "https://www.ashbyhq.com", privacy: "https://www.ashbyhq.com/privacy", terms: "https://www.ashbyhq.com/terms",
        about: L10n.text("Your agents search candidates, prepare interviews, and keep your pipeline moving in Ashby."),
        L10n.text("Prepare me for my interview with Sam in Ashby: background and questions."),
        L10n.text("Which candidates in Ashby have been in the same stage for over a week?"),
        L10n.text("Summarize the feedback in Ashby for the engineering role."))
    case "google-analytics":
      return page("Google", site: "https://marketingplatform.google.com/about/analytics/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents read your traffic, conversions, and reports in Google Analytics."),
        L10n.text("How did traffic change in Google Analytics this week compared with last week?"),
        L10n.text("Which pages bring the most sign-ups in Google Analytics?"),
        L10n.text("Where did our visitors come from last month in Google Analytics?"))
    case "google-search-console":
      return page("Google", site: "https://search.google.com/search-console/about", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents read your search queries, clicks, and indexing in Google Search Console."),
        L10n.text("Which searches brought us the most clicks in Google Search Console this month?"),
        L10n.text("Are any of our pages not indexed in Google Search Console?"),
        L10n.text("Which pages lost the most clicks in Google Search Console since last month?"))
    case "youtube":
      return page("Google", site: "https://www.youtube.com", privacy: "https://policies.google.com/privacy", terms: "https://www.youtube.com/t/terms",
        about: L10n.text("Your agents look after your channel on YouTube: videos, playlists, and stats."),
        L10n.text("Which of my videos on YouTube got the most views this month?"),
        L10n.text("Add my three newest videos to the Tutorials playlist on YouTube."),
        L10n.text("Write better descriptions for my last five videos on YouTube."))
    case "kit":
      return page("Kit", site: "https://kit.com", privacy: "https://kit.com/privacy", terms: "https://kit.com/terms",
        about: L10n.text("Your agents work with your subscribers, tags, and broadcasts in Kit."),
        L10n.text("How many new subscribers did we get in Kit this week?"),
        L10n.text("Tag everyone who clicked the launch email in Kit."),
        L10n.text("Draft a broadcast in Kit about the new course."))
    case "instagram":
      return page("Meta", site: "https://www.instagram.com", privacy: "https://privacycenter.instagram.com/policy", terms: "https://help.instagram.com/581066165581870",
        about: L10n.text("Your agents post, answer comments and messages, and read insights on Instagram, for Business and Creator accounts."),
        L10n.text("Which of our posts on Instagram did best this month?"),
        L10n.text("Answer the new comments on our latest post on Instagram."),
        L10n.text("Post this photo on Instagram with a short caption about the launch."))
    case "facebook":
      return page("Meta", site: "https://www.facebook.com", privacy: "https://www.facebook.com/privacy/policy/", terms: "https://www.facebook.com/terms.php",
        about: L10n.text("Your agents post, answer comments and messages, and read insights for your Pages on Facebook."),
        L10n.text("Which posts on our Page on Facebook reached the most people this month?"),
        L10n.text("Answer the new messages to our Page on Facebook."),
        L10n.text("Post our opening hours for the holidays on Facebook."))
    case "calendly":
      return page("Calendly", site: "https://calendly.com", privacy: "https://calendly.com/legal/privacy-notice", terms: "https://calendly.com/legal/customer-terms-conditions",
        about: L10n.text("Your agents check your booking links, scheduled meetings, and invitees in Calendly."),
        L10n.text("Who booked a call with me through Calendly this week?"),
        L10n.text("Send me my Calendly link for 30-minute meetings."),
        L10n.text("Cancel my meetings in Calendly on Friday and let the invitees know."))
    case "cal-com":
      return page("Cal.com", site: "https://cal.com", privacy: "https://cal.com/privacy", terms: "https://cal.com/terms",
        about: L10n.text("Your agents check your bookings, event types, and availability in Cal.com."),
        L10n.text("What’s booked for me tomorrow in Cal.com?"),
        L10n.text("Make a 15-minute intro call event type in Cal.com."),
        L10n.text("Block next Monday in Cal.com so no one can book it."))
    default:
      return nil
    }
  }

  /** A page from its maker, its three links and its words. */
  private static func page(_ maker: String, site: String, privacy: String, terms: String, about: String, _ examples: String...) -> ConnectorPage {
    ConnectorPage(maker: maker, about: about, examples: examples, website: URL(string: site), privacy: URL(string: privacy), terms: URL(string: terms))
  }

  /** Under the name: "By Google". */
  public var byline: String { L10n.text("By \(maker)") }

  /** The page's Information and its lines. */
  public static var information: String { L10n.text("Information") }
  public static var category: String { L10n.text("Category") }
  public static var developer: String { L10n.text("Developer") }
  public static var websiteWord: String { L10n.text("Website") }
  public static var privacyWord: String { L10n.text("Privacy Policy") }
  public static var termsWord: String { L10n.text("Terms of Service") }

  /** A link's address as Information shows it: the host without "www." (`policies.google.com`). */
  public static func shown(_ url: URL) -> String {
    let host = url.host ?? url.absoluteString
    return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
  }

  /** The connectors written so far, for the tests. */
  public static let written = ["gmail", "google-calendar", "google-drive", "outlook", "slack", "notion", "github", "linear", "dropbox", "hubspot", "airtable", "asana", "clickup", "monday", "todoist", "zoom", "google-meet", "figma", "canva", "miro", "webflow", "wix", "stripe", "paypal", "square", "ramp", "quickbooks", "salesforce", "intercom", "apollo", "jira", "vercel", "supabase", "sentry", "cloudflare", "mailchimp", "greenhouse", "gusto", "linkedin", "google-docs", "google-sheets", "google-slides", "onedrive", "google-tasks", "trello", "xero", "shopify", "brex", "pipedrive", "docusign", "klaviyo", "ashby", "google-analytics", "google-search-console", "youtube", "kit", "instagram", "facebook", "calendly", "cal-com"]
}
