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
    case "attio":
      return page("Attio", site: "https://attio.com", privacy: "https://attio.com/legal/privacy", terms: "https://attio.com/legal/services-agreement",
        about: L10n.text("Your agents look up and update the people, companies, deals, and lists in Attio."),
        L10n.text("Which deals in Attio haven’t moved in two weeks?"),
        L10n.text("Add Jordan Lee, CTO at Acme, to Attio."),
        L10n.text("Show me every company on our Q4 targets list in Attio."))
    case "zendesk":
      return page("Zendesk", site: "https://www.zendesk.com", privacy: "https://www.zendesk.com/company/agreements-and-terms/privacy-notice/", terms: "https://www.zendesk.com/company/agreements-and-terms/main-services-agreement/",
        about: L10n.text("Your agents read, answer, and sort your support tickets, and search your help center in Zendesk."),
        L10n.text("How many tickets in Zendesk are still open from last week?"),
        L10n.text("Draft a reply to the newest urgent ticket in Zendesk for me to check."),
        L10n.text("Find the article in Zendesk that explains returns and send its link to Sam."))
    case "microsoft-teams":
      return page("Microsoft", site: "https://www.microsoft.com/microsoft-teams", privacy: "https://privacy.microsoft.com/privacystatement", terms: "https://www.microsoft.com/servicesagreement",
        about: L10n.text("Your agents read and send messages in your chats and channels, and set up meetings in Microsoft Teams."),
        L10n.text("Summarize what I missed in the design channel in Microsoft Teams."),
        L10n.text("Set up a 30-minute meeting in Microsoft Teams with Sam tomorrow at 10."),
        L10n.text("Post the release notes in the announcements channel in Microsoft Teams."))
    case "discord":
      return page("Discord", site: "https://discord.com", privacy: "https://discord.com/privacy", terms: "https://discord.com/terms",
        about: L10n.text("Your agents see your profile and the servers you’re in on Discord, and check where an invite leads. They don’t read or send messages."),
        L10n.text("Which servers am I in on Discord?"),
        L10n.text("Check where this invite on Discord leads: discord.gg/acme."),
        L10n.text("Which accounts are linked to my profile on Discord?"))
    case "mercury":
      return page("Mercury", site: "https://mercury.com", privacy: "https://mercury.com/legal/privacy", terms: "https://mercury.com/legal/terms",
        about: L10n.text("Your agents read your business accounts, balances, and transactions in Mercury. They can’t move money."),
        L10n.text("What’s our balance across every account in Mercury?"),
        L10n.text("List this month’s card transactions over $500 in Mercury."),
        L10n.text("Show me what we paid contractors last quarter in Mercury."))
    case "posthog":
      return page("PostHog", site: "https://posthog.com", privacy: "https://posthog.com/privacy", terms: "https://posthog.com/terms",
        about: L10n.text("Your agents read your product analytics and insights, and manage feature flags in PostHog."),
        L10n.text("How many sign-ups did we get this week in PostHog?"),
        L10n.text("Which onboarding step loses the most people in PostHog?"),
        L10n.text("Turn on the new-checkout flag in PostHog for 1 in 10 users."))
    case "google-ads":
      return page("Google", site: "https://ads.google.com", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents read and adjust your campaigns, ad groups, keywords, and budgets in Google Ads."),
        L10n.text("Which campaigns in Google Ads had the best cost per conversion last week?"),
        L10n.text("Pause the keywords in Google Ads that spent over $50 without a conversion."),
        L10n.text("Raise the daily budget of our brand campaign in Google Ads to $40."))
    case "tiktok-ads":
      return page("TikTok", site: "https://ads.tiktok.com", privacy: "https://www.tiktok.com/legal/page/global/partner-privacy-policy/en", terms: "https://ads.tiktok.com/i18n/official/policy/terms",
        about: L10n.text("Your agents read and manage your campaigns, ads, audiences, and reports in TikTok Ads."),
        L10n.text("How did our campaigns in TikTok Ads do this week?"),
        L10n.text("Which ad in TikTok Ads has the lowest cost per click?"),
        L10n.text("Pause the ad groups in TikTok Ads that spent over $100 without a sale."))
    case "microsoft-excel":
      return page("Microsoft", site: "https://www.microsoft.com/microsoft-365/excel", privacy: "https://privacy.microsoft.com/privacystatement", terms: "https://www.microsoft.com/servicesagreement",
        about: L10n.text("Your agents read and write your workbooks in Excel: sheets, tables, and charts."),
        L10n.text("Add last week’s orders as new rows in the sales table in Excel."),
        L10n.text("What’s the total in our Q3 budget workbook in Excel?"),
        L10n.text("Add a chart of monthly revenue to our report in Excel."))
    case "reddit":
      return page("Reddit", site: "https://www.reddit.com", privacy: "https://www.reddit.com/policies/privacy-policy", terms: "https://redditinc.com/policies/user-agreement",
        about: L10n.text("Your agents search posts and comments on Reddit, and post and comment for you."),
        L10n.text("What are people on Reddit saying about our app this month?"),
        L10n.text("Find threads on Reddit where people ask for a tool like ours."),
        L10n.text("Draft a post on Reddit for r/startups about our launch, and show it to me first."))
    case "pinterest":
      return page("Pinterest", site: "https://www.pinterest.com", privacy: "https://policy.pinterest.com/privacy-policy", terms: "https://policy.pinterest.com/terms-of-service",
        about: L10n.text("Your agents create and organize your boards and pins on Pinterest, and read their analytics."),
        L10n.text("Which of my pins on Pinterest got the most saves this month?"),
        L10n.text("Make a board on Pinterest called Spring Looks with our new products."),
        L10n.text("Pin these five product photos to our Summer board on Pinterest."))
    case "gumroad":
      return page("Gumroad", site: "https://gumroad.com", privacy: "https://gumroad.com/privacy", terms: "https://gumroad.com/terms",
        about: L10n.text("Your agents look at your products, sales, and buyers on Gumroad."),
        L10n.text("How much did we sell on Gumroad this month?"),
        L10n.text("Which product on Gumroad sells best?"),
        L10n.text("Who bought the course on Gumroad this week?"))
    case "google-classroom":
      return page("Google", site: "https://edu.google.com/workspace-for-education/classroom/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents work with your courses, assignments, students, and announcements in Google Classroom."),
        L10n.text("Which students in Google Classroom haven’t turned in this week’s essay?"),
        L10n.text("Post an announcement in Google Classroom that Friday’s class moves to 2 pm."),
        L10n.text("List the assignments due next week in Google Classroom."))
    case "gorgias":
      return page("Gorgias", site: "https://www.gorgias.com", privacy: "https://www.gorgias.com/legal/privacy", terms: "https://www.gorgias.com/legal/terms-of-use",
        about: L10n.text("Your agents read and answer your store’s support tickets, and look up customers in Gorgias."),
        L10n.text("How many tickets in Gorgias are waiting for a reply?"),
        L10n.text("Draft replies in Gorgias to the open questions about shipping, for me to check."),
        L10n.text("Find every ticket in Gorgias from lea@acme.com."))
    case "gong":
      return page("Gong", site: "https://www.gong.io", privacy: "https://www.gong.io/legal/privacy-policy", terms: "https://www.gong.io/legal/terms-and-conditions",
        about: L10n.text("Your agents read your sales calls, transcripts, and deal insights in Gong."),
        L10n.text("Summarize yesterday’s call with Acme in Gong."),
        L10n.text("What objections came up most in Gong calls this month?"),
        L10n.text("Which deals in Gong are at risk, and why?"))
    case "capsule-crm":
      return page("Capsule", site: "https://capsulecrm.com", privacy: "https://capsulecrm.com/privacy/", terms: "https://capsulecrm.com/terms/",
        about: L10n.text("Your agents work with your contacts, opportunities, and tasks in Capsule."),
        L10n.text("Add Jordan from Acme as a contact in Capsule."),
        L10n.text("Which opportunities in Capsule close this month?"),
        L10n.text("What tasks are due today in Capsule?"))
    case "dialpad":
      return page("Dialpad", site: "https://www.dialpad.com", privacy: "https://www.dialpad.com/legal/", terms: "https://www.dialpad.com/legal/msaterms/",
        about: L10n.text("Your agents look up your calls, texts, and contacts, and read call summaries in Dialpad."),
        L10n.text("Summarize this morning’s calls in Dialpad."),
        L10n.text("Text Sam from Dialpad that I’m running ten minutes late."),
        L10n.text("Add Jordan’s number to my contacts in Dialpad."))
    case "link":
      return page("Stripe", site: "https://link.com", privacy: "https://link.com/privacy", terms: "https://link.com/terms",
        about: L10n.text("Your agents buy what you ask for with Link, and each purchase waits for your OK in the Link app. They can also read the bank accounts you share. US only."),
        L10n.text("Buy two tickets for Saturday’s show with Link."),
        L10n.text("Reorder my usual coffee beans with Link."),
        L10n.text("What’s the balance of my checking account in Link?"))
    case "granola":
      return page("Granola", site: "https://www.granola.ai", privacy: "https://www.granola.ai/privacy", terms: "https://www.granola.ai/terms",
        about: L10n.text("Your agents read your meeting notes, transcripts, and folders in Granola."),
        L10n.text("Summarize this week’s meetings in Granola in five points."),
        L10n.text("What action items do I have from today’s meetings in Granola?"),
        L10n.text("Find the meeting in Granola where we talked about pricing."))
    case "resend":
      return page("Resend", site: "https://resend.com", privacy: "https://resend.com/legal/privacy-policy", terms: "https://resend.com/legal/terms-of-service",
        about: L10n.text("Your agents send email, and manage your domains, audiences, and broadcasts in Resend."),
        L10n.text("Is our domain verified in Resend?"),
        L10n.text("Send me a test email from Resend."),
        L10n.text("Draft a broadcast in Resend about the new release."))
    case "sharepoint":
      return page("Microsoft", site: "https://www.microsoft.com/microsoft-365/sharepoint/collaboration", privacy: "https://privacy.microsoft.com/privacystatement", terms: "https://www.microsoft.com/servicesagreement",
        about: L10n.text("Your agents find and work with the sites, lists, and files in SharePoint."),
        L10n.text("Find the latest brand guidelines in SharePoint."),
        L10n.text("Add the Acme launch to the project tracker list in SharePoint."),
        L10n.text("Share the Q3 report in SharePoint with jordan@acme.com."))
    case "onenote":
      return page("Microsoft", site: "https://www.microsoft.com/microsoft-365/onenote/digital-note-taking-app", privacy: "https://privacy.microsoft.com/privacystatement", terms: "https://www.microsoft.com/servicesagreement",
        about: L10n.text("Your agents read and write the notebooks, sections, and pages in OneNote."),
        L10n.text("Summarize this week’s meeting notes in OneNote."),
        L10n.text("Add a page in OneNote with today’s to-dos."),
        L10n.text("Find my notes in OneNote about the kitchen renovation."))
    case "microsoft-to-do":
      return page("Microsoft", site: "https://www.microsoft.com/microsoft-365/microsoft-to-do-list-app", privacy: "https://privacy.microsoft.com/privacystatement", terms: "https://www.microsoft.com/servicesagreement",
        about: L10n.text("Your agents add, find, and complete your tasks and lists in Microsoft To Do."),
        L10n.text("Add “call the dentist” to Microsoft To Do for tomorrow."),
        L10n.text("What’s on my list in Microsoft To Do today?"),
        L10n.text("Mark “send invoices” as done in Microsoft To Do."))
    case "lovable":
      return page("Lovable", site: "https://lovable.dev", privacy: "https://lovable.dev/privacy", terms: "https://lovable.dev/terms",
        about: L10n.text("Your agents build and change your apps and sites in Lovable from what you describe."),
        L10n.text("Build a landing page in Lovable for our new coffee subscription."),
        L10n.text("Add a contact form to my site in Lovable."),
        L10n.text("Change the colors of our app in Lovable to match the new logo."))
    case "shop":
      return page("Shopify", site: "https://shop.app", privacy: "https://www.shopify.com/legal/privacy/app-users", terms: "https://shop.app/terms-of-service",
        about: L10n.text("Your agents find products across Shopify stores and buy them with your Shop card, with your OK for each purchase. They track your orders too."),
        L10n.text("Find a linen shirt under $80 on Shop."),
        L10n.text("Where’s my latest order from Shop?"),
        L10n.text("Buy the same running socks again with Shop."))
    case "whatsapp":
      return page("Meta", site: "https://business.whatsapp.com", privacy: "https://www.whatsapp.com/legal/privacy-policy", terms: "https://www.whatsapp.com/legal/business-terms",
        about: L10n.text("Your agents send messages and manage templates for your WhatsApp Business account. Not personal WhatsApp."),
        L10n.text("Send the order-ready template on WhatsApp to Lea."),
        L10n.text("Which of our message templates on WhatsApp are approved?"),
        L10n.text("Write a template on WhatsApp for appointment reminders."))
    case "twitch":
      return page("Twitch", site: "https://www.twitch.tv", privacy: "https://www.twitch.tv/p/legal/privacy-notice/", terms: "https://www.twitch.tv/p/legal/terms-of-service/",
        about: L10n.text("Your agents look after your channel on Twitch: streams, clips, chat, and schedule."),
        L10n.text("Make a clip on Twitch of the last 30 seconds of my stream."),
        L10n.text("Change my stream title on Twitch to Late-night coding."),
        L10n.text("Who are my newest followers on Twitch?"))
    case "reddit-ads":
      return page("Reddit", site: "https://ads.reddit.com", privacy: "https://www.reddit.com/policies/privacy-policy", terms: "https://redditinc.com/policies/user-agreement",
        about: L10n.text("Your agents read and manage your campaigns, ad groups, ads, and reports in Reddit Ads."),
        L10n.text("How did our campaigns in Reddit Ads do last week?"),
        L10n.text("Which ad in Reddit Ads gets the most clicks?"),
        L10n.text("Set up a campaign in Reddit Ads for the launch with a $30 daily budget."))
    case "pinterest-ads":
      return page("Pinterest", site: "https://ads.pinterest.com", privacy: "https://policy.pinterest.com/privacy-policy", terms: "https://business.pinterest.com/en/business-terms-of-service/",
        about: L10n.text("Your agents read the results of your campaigns and ad groups in Pinterest Ads, and adjust them."),
        L10n.text("How did our campaigns in Pinterest Ads do this month?"),
        L10n.text("Pause the ad groups in Pinterest Ads that had no conversions."),
        L10n.text("Raise the budget of the spring campaign in Pinterest Ads to $50 a day."))
    case "omnisend":
      return page("Omnisend", site: "https://www.omnisend.com", privacy: "https://www.omnisend.com/privacy/", terms: "https://www.omnisend.com/terms/",
        about: L10n.text("Your agents work with your contacts, campaigns, products, and orders in Omnisend."),
        L10n.text("List the campaigns we sent this month in Omnisend."),
        L10n.text("Add lea@acme.com to our contacts in Omnisend with the VIP tag."),
        L10n.text("How many new contacts joined in Omnisend this week?"))
    case "dub":
      return page("Dub", site: "https://dub.co", privacy: "https://dub.co/legal/privacy", terms: "https://dub.co/legal/terms",
        about: L10n.text("Your agents make and organize your short links, and read their clicks in Dub."),
        L10n.text("Make a short link in Dub for our pricing page."),
        L10n.text("How many clicks has the launch link had in Dub?"),
        L10n.text("Tag every podcast link in Dub as podcast."))
    case "eventbrite":
      return page("Eventbrite", site: "https://www.eventbrite.com", privacy: "https://www.eventbrite.com/help/en-us/articles/460838/eventbrite-privacy-policy/", terms: "https://www.eventbrite.com/corporate/legal/legalterms/",
        about: L10n.text("Your agents look after your events, tickets, orders, and attendees on Eventbrite."),
        L10n.text("How many tickets have we sold for Saturday’s workshop on Eventbrite?"),
        L10n.text("List the attendees of next week’s meetup on Eventbrite."),
        L10n.text("Copy last month’s workshop on Eventbrite for December 12."))
    case "google-photos":
      return page("Google", site: "https://www.google.com/photos/about/", privacy: "https://policies.google.com/privacy", terms: "https://policies.google.com/terms",
        about: L10n.text("Your agents upload your photos and make albums in Google Photos. They see only the photos they added."),
        L10n.text("Upload these photos to a new album in Google Photos called Lisbon."),
        L10n.text("Make an album in Google Photos for the team offsite."),
        L10n.text("Add today’s product shots to the Catalog album in Google Photos."))
    case "mural":
      return page("Mural", site: "https://www.mural.co", privacy: "https://www.mural.co/terms/privacy-statement", terms: "https://www.mural.co/terms/terms-of-service",
        about: L10n.text("Your agents read and add to your boards in Mural: sticky notes, text, and shapes."),
        L10n.text("Summarize the sticky notes on our brainstorm board in Mural."),
        L10n.text("Add these five ideas as sticky notes to our planning board in Mural."),
        L10n.text("Make a new board in Mural for Friday’s retro."))
    case "zeplin":
      return page("Zeplin", site: "https://zeplin.io", privacy: "https://zeplin.io/privacy/", terms: "https://zeplin.io/terms/",
        about: L10n.text("Your agents read your projects, screens, components, and style guides in Zeplin."),
        L10n.text("List the colors in our style guide in Zeplin."),
        L10n.text("Which screens in Zeplin have a new version this week?"),
        L10n.text("Show me the notes on the checkout screen in Zeplin."))
    case "contentful":
      return page("Contentful", site: "https://www.contentful.com", privacy: "https://www.contentful.com/legal/privacy-at-contentful/privacy-notice/", terms: "https://www.contentful.com/legal/terms-of-service/",
        about: L10n.text("Your agents read and edit the entries, assets, and content types in Contentful."),
        L10n.text("Which blog posts in Contentful are still drafts?"),
        L10n.text("Change the price on the Pro plan entry in Contentful to $20."),
        L10n.text("Publish the new FAQ entry in Contentful."))
    case "box":
      return page("Box", site: "https://www.box.com", privacy: "https://www.box.com/legal/privacypolicy", terms: "https://www.box.com/legal/termsofservice",
        about: L10n.text("Your agents search, read, and share your files and folders in Box."),
        L10n.text("Find the signed contract in Box."),
        L10n.text("Share the Q3 folder in Box with jordan@acme.com."),
        L10n.text("Summarize the office lease PDF in Box."))
    case "confluence":
      return page("Atlassian", site: "https://www.atlassian.com/software/confluence", privacy: "https://www.atlassian.com/legal/privacy-policy", terms: "https://www.atlassian.com/legal/atlassian-customer-agreement",
        about: L10n.text("Your agents search, read, and write the spaces and pages in Confluence."),
        L10n.text("Summarize the onboarding page in Confluence."),
        L10n.text("Write a page in Confluence with the notes from today’s planning."),
        L10n.text("Find every page in Confluence that mentions the API rate limits."))
    case "notebooklm":
      return page("Google", site: "https://cloud.google.com/gemini-enterprise/notebooklm-enterprise", privacy: "https://cloud.google.com/terms/cloud-privacy-notice", terms: "https://cloud.google.com/terms",
        about: L10n.text("Your agents make notebooks, add sources, and create audio overviews in NotebookLM Enterprise. Not the free NotebookLM."),
        L10n.text("Make a notebook in NotebookLM from these three reports."),
        L10n.text("Add this article as a source to my research notebook in NotebookLM."),
        L10n.text("Create an audio overview in NotebookLM of the market notebook."))
    case "basecamp":
      return page("37signals", site: "https://basecamp.com", privacy: "https://basecamp.com/about/policies/privacy", terms: "https://basecamp.com/about/policies/terms",
        about: L10n.text("Your agents work with your projects, to-dos, messages, and schedules in Basecamp."),
        L10n.text("What to-dos are due this week in Basecamp?"),
        L10n.text("Post an update on the website project’s message board in Basecamp."),
        L10n.text("Mark the logo to-do as done in Basecamp."))
    case "wrike":
      return page("Wrike", site: "https://www.wrike.com", privacy: "https://www.wrike.com/security/privacy/", terms: "https://www.wrike.com/security/terms/",
        about: L10n.text("Your agents find, create, and update tasks, projects, and folders in Wrike."),
        L10n.text("What tasks are assigned to me in Wrike this week?"),
        L10n.text("Create a task in Wrike for the launch checklist, due Friday."),
        L10n.text("Comment on the homepage task in Wrike with the new copy."))
    case "ticktick":
      return page("TickTick", site: "https://ticktick.com", privacy: "https://ticktick.com/about/privacy", terms: "https://ticktick.com/about/tos",
        about: L10n.text("Your agents add, find, and complete your tasks and lists in TickTick."),
        L10n.text("Add “book flights” to TickTick for Monday."),
        L10n.text("What’s due today in TickTick?"),
        L10n.text("Mark “pay rent” as done in TickTick."))
    case "harvest":
      return page("Harvest", site: "https://www.getharvest.com", privacy: "https://www.getharvest.com/privacy-policy", terms: "https://www.getharvest.com/terms-of-service",
        about: L10n.text("Your agents log and read your time, projects, clients, and invoices in Harvest."),
        L10n.text("How many hours did I log this week in Harvest?"),
        L10n.text("Log two hours on the Acme project in Harvest for today."),
        L10n.text("Create an invoice in Harvest for Acme from this month’s hours."))
    case "typeform":
      return page("Typeform", site: "https://www.typeform.com", privacy: "https://www.typeform.com/privacy-policy/", terms: "https://www.typeform.com/terms-service/",
        about: L10n.text("Your agents build your forms and read their responses in Typeform."),
        L10n.text("How many responses did the feedback form get this week in Typeform?"),
        L10n.text("Summarize the answers to our customer survey in Typeform."),
        L10n.text("Make a three-question signup form in Typeform."))
    case "productboard":
      return page("Productboard", site: "https://www.productboard.com", privacy: "https://www.productboard.com/privacy-policy/", terms: "https://www.productboard.com/terms-of-service/",
        about: L10n.text("Your agents work with your features, notes, and customer feedback in Productboard."),
        L10n.text("What feedback in Productboard asks for a dark mode?"),
        L10n.text("Add this customer’s request as a note in Productboard."),
        L10n.text("Which features in Productboard are planned for the next release?"))
    case "google-maps":
      return page("Google", site: "https://www.google.com/maps", privacy: "https://policies.google.com/privacy", terms: "https://www.google.com/help/terms_maps/",
        about: L10n.text("Your agents look up places, directions, and travel times in Google Maps."),
        L10n.text("How long is the drive from the office to the airport right now in Google Maps?"),
        L10n.text("Find coffee shops near our office in Google Maps that open before 7."),
        L10n.text("How long does the train from Paris to Lyon take in Google Maps?"))
    case "webex":
      return page("Cisco", site: "https://www.webex.com", privacy: "https://www.cisco.com/c/en/us/about/legal/privacy-full.html", terms: "https://www.webex.com/terms-of-service.html",
        about: L10n.text("Your agents read and send messages in your spaces and teams in Webex."),
        L10n.text("Summarize today’s messages in the marketing space in Webex."),
        L10n.text("Send the agenda to the project space in Webex."),
        L10n.text("Make a space in Webex for the Acme launch and add Sam and Lea."))
    case "fathom":
      return page("Fathom", site: "https://www.fathom.ai", privacy: "https://www.fathom.ai/privacy", terms: "https://www.fathom.ai/terms",
        about: L10n.text("Your agents read your recorded meetings, summaries, and transcripts in Fathom."),
        L10n.text("Summarize my last call in Fathom."),
        L10n.text("What did Acme say about pricing in Fathom calls this week?"),
        L10n.text("Send me the transcript of yesterday’s demo from Fathom."))
    case "freshbooks":
      return page("FreshBooks", site: "https://www.freshbooks.com", privacy: "https://www.freshbooks.com/policies/privacy", terms: "https://www.freshbooks.com/policies/terms-of-service",
        about: L10n.text("Your agents look up your clients, projects, and journal entries in FreshBooks."),
        L10n.text("List my clients in FreshBooks with their email addresses."),
        L10n.text("Which projects are open in FreshBooks?"),
        L10n.text("Show me this month’s journal entries in FreshBooks."))
    case "ynab":
      return page("YNAB", site: "https://www.ynab.com", privacy: "https://www.ynab.com/privacy-policy", terms: "https://www.ynab.com/terms",
        about: L10n.text("Your agents read your budgets, accounts, and transactions in YNAB, and schedule transactions."),
        L10n.text("How much is left in the Groceries category this month in YNAB?"),
        L10n.text("What did we spend on eating out last month in YNAB?"),
        L10n.text("Add a monthly $15 transaction in YNAB for the music subscription."))
    case "splitwise":
      return page("Splitwise", site: "https://www.splitwise.com", privacy: "https://www.splitwise.com/privacy", terms: "https://www.splitwise.com/terms",
        about: L10n.text("Your agents add and split expenses, and check who owes whom in Splitwise."),
        L10n.text("Add $84 for dinner to our Lisbon group in Splitwise, split evenly."),
        L10n.text("Who owes me money in Splitwise?"),
        L10n.text("How much did our flat spend on groceries this month in Splitwise?"))
    case "shippo":
      return page("Shippo", site: "https://goshippo.com", privacy: "https://privacy.goshippo.com/policies?name=privacy-notice", terms: "https://privacy.goshippo.com/policies?name=terms-of-use",
        about: L10n.text("Your agents compare shipping rates, buy labels, and track parcels in Shippo."),
        L10n.text("What’s the cheapest rate in Shippo to send a 2 kg box to Chicago?"),
        L10n.text("Buy a label in Shippo for Lea’s order."),
        L10n.text("Track the parcel for order 1042 in Shippo."))
    case "dynamics-365":
      return page("Microsoft", site: "https://www.microsoft.com/dynamics-365", privacy: "https://privacy.microsoft.com/privacystatement", terms: "https://www.microsoft.com/servicesagreement",
        about: L10n.text("Your agents work with your leads, accounts, contacts, and opportunities in Dynamics 365."),
        L10n.text("Add Jordan from Acme as a lead in Dynamics 365."),
        L10n.text("Which opportunities in Dynamics 365 close this quarter?"),
        L10n.text("Log a call with Acme in Dynamics 365 and add a note."))
    case "gitlab":
      return page("GitLab", site: "https://about.gitlab.com", privacy: "https://about.gitlab.com/privacy/", terms: "https://about.gitlab.com/terms/",
        about: L10n.text("Your agents work with your projects, issues, merge requests, and pipelines in GitLab."),
        L10n.text("Which merge requests in GitLab are waiting for my review?"),
        L10n.text("Why did the last pipeline fail in GitLab?"),
        L10n.text("Open an issue in GitLab for the login bug."))
    case "bitbucket":
      return page("Atlassian", site: "https://www.atlassian.com/software/bitbucket", privacy: "https://www.atlassian.com/legal/privacy-policy", terms: "https://www.atlassian.com/legal/atlassian-customer-agreement",
        about: L10n.text("Your agents work with your repositories, pull requests, and pipelines in Bitbucket."),
        L10n.text("Summarize the open pull requests in Bitbucket."),
        L10n.text("Why did the last pipeline fail in Bitbucket?"),
        L10n.text("Create a branch in Bitbucket called fix-login."))
    case "pagerduty":
      return page("PagerDuty", site: "https://www.pagerduty.com", privacy: "https://www.pagerduty.com/privacy-policy/", terms: "https://www.pagerduty.com/terms-of-service/",
        about: L10n.text("Your agents look up incidents, on-call schedules, and services in PagerDuty."),
        L10n.text("Who’s on call right now in PagerDuty?"),
        L10n.text("What incidents are open in PagerDuty?"),
        L10n.text("Summarize last week’s incidents in PagerDuty."))
    case "google-bigquery":
      return page("Google", site: "https://cloud.google.com/bigquery", privacy: "https://cloud.google.com/terms/cloud-privacy-notice", terms: "https://cloud.google.com/terms",
        about: L10n.text("Your agents read your datasets and tables, and run SQL in BigQuery."),
        L10n.text("Count last week’s orders in the orders table in BigQuery."),
        L10n.text("Which tables are in our analytics dataset in BigQuery?"),
        L10n.text("Run a query in BigQuery for this month’s revenue by country."))
    case "hugging-face":
      return page("Hugging Face", site: "https://huggingface.co", privacy: "https://huggingface.co/privacy", terms: "https://huggingface.co/terms-of-service",
        about: L10n.text("Your agents look up models, datasets, papers, and Spaces on Hugging Face."),
        L10n.text("Find a small open model on Hugging Face for translating French to English."),
        L10n.text("Show me the first rows of this dataset on Hugging Face."),
        L10n.text("What are today’s most talked-about papers on Hugging Face?"))
    case "excalidraw":
      return page("Excalidraw", site: "https://plus.excalidraw.com", privacy: "https://plus.excalidraw.com/privacy-policy", terms: "https://plus.excalidraw.com/terms-of-service",
        about: L10n.text("Your agents draw hand-drawn diagrams in Excalidraw and share them with a link."),
        L10n.text("Draw a diagram in Excalidraw of how our sign-up works."),
        L10n.text("Sketch our office floor plan in Excalidraw."),
        L10n.text("Make a flowchart in Excalidraw of the refund process and send me the link."))
    case "heygen":
      return page("HeyGen", site: "https://www.heygen.com", privacy: "https://www.heygen.com/privacy", terms: "https://www.heygen.com/terms",
        about: L10n.text("Your agents make videos with AI avatars and voices in HeyGen."),
        L10n.text("Make a 30-second welcome video in HeyGen for new customers."),
        L10n.text("Turn this script into a video in HeyGen with a friendly avatar."),
        L10n.text("Which avatars can I use in HeyGen?"))
    case "higgsfield":
      return page("Higgsfield", site: "https://higgsfield.ai", privacy: "https://higgsfield.ai/privacy-policy", terms: "https://higgsfield.ai/terms-of-use-agreement",
        about: L10n.text("Your agents generate images and videos with AI models in Higgsfield."),
        L10n.text("Make a product photo in Higgsfield of our mug on a marble table."),
        L10n.text("Turn this photo into a five-second video in Higgsfield."),
        L10n.text("Generate three poster ideas in Higgsfield for the summer sale."))
    case "gamma":
      return page("Gamma", site: "https://gamma.app", privacy: "https://gamma.app/privacy", terms: "https://gamma.app/terms",
        about: L10n.text("Your agents make presentations, documents, and web pages in Gamma."),
        L10n.text("Make a ten-slide deck in Gamma from this report."),
        L10n.text("Turn these notes into a one-page site in Gamma."),
        L10n.text("Write a document in Gamma explaining our new pricing."))
    case "descript":
      return page("Descript", site: "https://www.descript.com", privacy: "https://www.descript.com/privacy", terms: "https://www.descript.com/terms",
        about: L10n.text("Your agents edit your videos and podcasts in Descript: they import media, run edits, and export."),
        L10n.text("Remove the filler words from my latest podcast episode in Descript."),
        L10n.text("Import this recording into Descript and cut the first two minutes."),
        L10n.text("Export the interview in Descript as an MP4."))
    case "lucid":
      return page("Lucid", site: "https://lucid.co", privacy: "https://lucid.co/privacy", terms: "https://lucid.co/tos",
        about: L10n.text("Your agents make and read diagrams and whiteboards in Lucidchart and Lucidspark."),
        L10n.text("Draw a flowchart in Lucidchart of our onboarding."),
        L10n.text("Summarize the board from yesterday’s workshop in Lucid."),
        L10n.text("Make an org chart in Lucidchart from this list."))
    case "eraser":
      return page("Eraser", site: "https://www.eraser.io", privacy: "https://www.eraser.io/privacy", terms: "https://www.eraser.io/terms",
        about: L10n.text("Your agents make technical diagrams and docs in Eraser."),
        L10n.text("Draw a diagram in Eraser of our API, database, and queue."),
        L10n.text("Turn this architecture description into a diagram in Eraser."),
        L10n.text("Write a design doc in Eraser for the new billing service."))
    case "mobbin":
      return page("Mobbin", site: "https://mobbin.com", privacy: "https://mobbin.com/privacy", terms: "https://mobbin.com/terms",
        about: L10n.text("Your agents search real apps’ screens and flows in Mobbin for design ideas."),
        L10n.text("Find onboarding screens in Mobbin from top finance apps."),
        L10n.text("Show me checkout flows in Mobbin from food delivery apps."),
        L10n.text("Find settings screens in Mobbin with a dark mode."))
    case "magic-patterns":
      return page("Magic Patterns", site: "https://www.magicpatterns.com", privacy: "https://www.magicpatterns.com/docs/documentation/legal/privacy", terms: "https://www.magicpatterns.com/docs/documentation/legal/terms",
        about: L10n.text("Your agents design and change app screens in Magic Patterns from what you describe."),
        L10n.text("Design a sign-up screen in Magic Patterns for our app."),
        L10n.text("Make the pricing page in Magic Patterns use our brand colors."),
        L10n.text("Add a search bar to the dashboard design in Magic Patterns."))
    case "pandadoc":
      return page("PandaDoc", site: "https://www.pandadoc.com", privacy: "https://www.pandadoc.com/legal/privacy-notice/", terms: "https://www.pandadoc.com/terms-of-use/",
        about: L10n.text("Your agents create, send, and track proposals, quotes, and contracts in PandaDoc."),
        L10n.text("Send the proposal template in PandaDoc to jordan@acme.com."),
        L10n.text("Which documents in PandaDoc are still waiting for a signature?"),
        L10n.text("Make a quote in PandaDoc for Acme with three seats at $40 each."))
    case "otter":
      return page("Otter.ai", site: "https://otter.ai", privacy: "https://otter.ai/privacy-policy", terms: "https://otter.ai/terms-of-service",
        about: L10n.text("Your agents read your meeting transcripts and summaries in Otter.ai. Read-only."),
        L10n.text("Summarize today’s meetings in Otter.ai."),
        L10n.text("What did Sam say about the budget in yesterday’s call in Otter.ai?"),
        L10n.text("Find the meeting in Otter.ai where we talked about hiring."))
    case "read-ai":
      return page("Read AI", site: "https://www.read.ai", privacy: "https://www.read.ai/privacy-policy", terms: "https://www.read.ai/termsofservice",
        about: L10n.text("Your agents read your meeting summaries, transcripts, and action items in Read AI."),
        L10n.text("What are my action items from this week’s meetings in Read AI?"),
        L10n.text("Summarize the Acme call in Read AI."),
        L10n.text("Find the meeting in Read AI where we set the launch date."))
    case "fellow":
      return page("Fellow", site: "https://fellow.ai", privacy: "https://fellow.ai/privacy-policy", terms: "https://fellow.ai/terms-of-use",
        about: L10n.text("Your agents read and update your meeting notes, action items, and agendas in Fellow."),
        L10n.text("What action items do I have in Fellow this week?"),
        L10n.text("Add the budget review to Monday’s agenda in Fellow."),
        L10n.text("Summarize the notes from my one-on-one with Sam in Fellow."))
    case "plaid":
      return page("Plaid", site: "https://plaid.com", privacy: "https://plaid.com/legal/#privacy-statement", terms: "https://plaid.com/legal/#developer-policy",
        about: L10n.text("For teams building on Plaid: your agents read your integration’s Items, Link conversion, and usage. Read-only."),
        L10n.text("Which Items on Plaid have errors right now?"),
        L10n.text("How did our Link conversion change this week on Plaid?"),
        L10n.text("How many API calls did we make on Plaid this month?"))
    case "clay":
      return page("Clay", site: "https://www.clay.com", privacy: "https://www.clay.com/privacy", terms: "https://www.clay.com/terms-of-service",
        about: L10n.text("Your agents research companies and people, and enrich your lists in Clay."),
        L10n.text("Find ten companies like Acme in Clay."),
        L10n.text("Enrich this list of leads in Clay with job titles and emails."),
        L10n.text("Research Acme’s leadership team in Clay."))
    case "netlify":
      return page("Netlify", site: "https://www.netlify.com", privacy: "https://www.netlify.com/privacy/", terms: "https://www.netlify.com/legal/terms-of-use/",
        about: L10n.text("Your agents manage your sites, deploys, and environment settings on Netlify."),
        L10n.text("Did the last deploy on Netlify succeed?"),
        L10n.text("Deploy the latest version of our site on Netlify."),
        L10n.text("Add the API_URL variable to our site on Netlify."))
    case "neon":
      return page("Neon", site: "https://neon.com", privacy: "https://neon.com/privacy-policy", terms: "https://neon.com/terms-of-service",
        about: L10n.text("Your agents work with your Postgres projects, branches, and SQL in Neon."),
        L10n.text("Make a branch in Neon of our production database for testing."),
        L10n.text("Run this query in Neon and show me the results."),
        L10n.text("Which tables are in our main database in Neon?"))
    case "beehiiv":
      return page("Beehiiv", site: "https://www.beehiiv.com", privacy: "https://www.beehiiv.com/privacy", terms: "https://www.beehiiv.com/tou",
        about: L10n.text("Your agents work with your newsletters, posts, and subscribers in Beehiiv."),
        L10n.text("How many people subscribed in Beehiiv this week?"),
        L10n.text("Draft a post in Beehiiv about our new feature."),
        L10n.text("What was the open rate of last week’s newsletter in Beehiiv?"))
    case "mailerlite":
      return page("MailerLite", site: "https://www.mailerlite.com", privacy: "https://www.mailerlite.com/legal/privacy-policy", terms: "https://www.mailerlite.com/legal/terms-of-service",
        about: L10n.text("Your agents work with your subscribers, groups, campaigns, and automations in MailerLite."),
        L10n.text("Add lea@acme.com to the Customers group in MailerLite."),
        L10n.text("How did last week’s campaign do in MailerLite?"),
        L10n.text("Draft a campaign in MailerLite announcing our summer sale."))
    case "getresponse":
      return page("GetResponse", site: "https://www.getresponse.com", privacy: "https://www.getresponse.com/legal/privacy", terms: "https://www.getresponse.com/legal",
        about: L10n.text("Your agents work with your contacts, lists, newsletters, and automations in GetResponse."),
        L10n.text("How many contacts joined our main list in GetResponse this month?"),
        L10n.text("Draft a newsletter in GetResponse about the new course."),
        L10n.text("Which automations in GetResponse are running?"))
    case "customer-io":
      return page("Customer.io", site: "https://customer.io", privacy: "https://customer.io/legal/privacy-policy", terms: "https://customer.io/legal/terms-of-service",
        about: L10n.text("Your agents look up people and segments, and work with campaigns and messages in Customer.io."),
        L10n.text("How many people are in the trial segment in Customer.io?"),
        L10n.text("Which campaign in Customer.io sends the welcome email?"),
        L10n.text("Show me the messages sent to lea@acme.com this week in Customer.io."))
    case "lemlist":
      return page("Lemlist", site: "https://www.lemlist.com", privacy: "https://www.lemlist.com/legal/privacy-policy", terms: "https://www.lemlist.com/legal/terms",
        about: L10n.text("Your agents run your outreach campaigns, leads, and replies in Lemlist."),
        L10n.text("Which leads replied to our campaign in Lemlist this week?"),
        L10n.text("Add these ten leads to the founders campaign in Lemlist."),
        L10n.text("What’s the reply rate of each campaign in Lemlist?"))
    case "mixpanel":
      return page("Mixpanel", site: "https://mixpanel.com", privacy: "https://mixpanel.com/legal/privacy-policy/", terms: "https://mixpanel.com/legal/terms-of-use/",
        about: L10n.text("Your agents read your product analytics in Mixpanel: events, funnels, and retention."),
        L10n.text("How many people used search this week in Mixpanel?"),
        L10n.text("Where do people drop off in the checkout funnel in Mixpanel?"),
        L10n.text("What’s the 30-day retention in Mixpanel for people who joined in September?"))
    case "amplitude":
      return page("Amplitude", site: "https://amplitude.com", privacy: "https://amplitude.com/privacy", terms: "https://amplitude.com/terms",
        about: L10n.text("Your agents read your charts, cohorts, and experiments in Amplitude."),
        L10n.text("How did daily active users change this month in Amplitude?"),
        L10n.text("Which experiment in Amplitude won last week?"),
        L10n.text("Make a cohort in Amplitude of people who used the app three days in a row."))
    case "bitly":
      return page("Bitly", site: "https://bitly.com", privacy: "https://bitly.com/pages/privacy/", terms: "https://bitly.com/pages/terms-of-service/",
        about: L10n.text("Your agents make short links and QR codes, and read their clicks in Bitly."),
        L10n.text("Make a short link in Bitly for our spring sale page."),
        L10n.text("How many clicks did the newsletter link get in Bitly?"),
        L10n.text("Make a QR code in Bitly for the menu page."))
    case "ahrefs":
      return page("Ahrefs", site: "https://ahrefs.com", privacy: "https://ahrefs.com/legal/privacy-policy", terms: "https://ahrefs.com/legal/terms",
        about: L10n.text("Your agents check backlinks, keywords, and site audits in Ahrefs."),
        L10n.text("Which sites linked to us this month in Ahrefs?"),
        L10n.text("Find easy keywords in Ahrefs for our coffee subscription."),
        L10n.text("What issues did the last site audit find in Ahrefs?"))
    case "moz":
      return page("Moz", site: "https://moz.com", privacy: "https://moz.com/privacy-policy", terms: "https://moz.com/terms-of-use",
        about: L10n.text("Your agents look up domain authority, links, and keywords in Moz. Needs a Moz API plan."),
        L10n.text("What’s our domain authority in Moz compared with acme.com?"),
        L10n.text("Which pages link to our site in Moz?"),
        L10n.text("How hard is the keyword “coffee subscription” in Moz?"))
    case "dataforseo":
      return page("DataForSEO", site: "https://dataforseo.com", privacy: "https://dataforseo.com/privacy-policy/", terms: "https://dataforseo.com/terms-of-service/",
        about: L10n.text("Your agents pull search results, keyword, and backlink data from DataForSEO."),
        L10n.text("Get the top ten search results for “best espresso machine” from DataForSEO."),
        L10n.text("How many people search for “oat milk latte” each month, according to DataForSEO?"),
        L10n.text("Pull the backlinks for acme.com from DataForSEO."))
    case "semrush":
      return page("Semrush", site: "https://www.semrush.com", privacy: "https://www.semrush.com/company/legal/privacy-policy/", terms: "https://www.semrush.com/company/legal/terms-of-service/",
        about: L10n.text("Your agents check keywords, traffic, and backlinks for you and your competitors in Semrush."),
        L10n.text("Which keywords bring acme.com the most traffic in Semrush?"),
        L10n.text("Compare our traffic with our top competitor in Semrush."),
        L10n.text("Find this month’s new backlinks to our site in Semrush."))
    case "brevo":
      return page("Brevo", site: "https://www.brevo.com", privacy: "https://www.brevo.com/legal/privacypolicy/", terms: "https://www.brevo.com/legal/termsofuse/",
        about: L10n.text("Your agents work with your contacts and your email and SMS campaigns in Brevo."),
        L10n.text("Add lea@acme.com to the newsletter list in Brevo."),
        L10n.text("How did yesterday’s email campaign do in Brevo?"),
        L10n.text("Draft an SMS campaign in Brevo for the weekend sale."))
    case "runway":
      return page("Runway", site: "https://runwayml.com", privacy: "https://runway.com/privacy-policy", terms: "https://runway.com/terms-of-use",
        about: L10n.text("Your agents generate and edit video and images with AI in Runway."),
        L10n.text("Make a five-second video in Runway of waves at sunset."),
        L10n.text("Turn this product photo into a short video in Runway."),
        L10n.text("Make three header images in Runway for our blog."))
    case "black-forest-labs":
      return page("Black Forest Labs", site: "https://bfl.ai", privacy: "https://bfl.ai/legal/privacy-policy", terms: "https://bfl.ai/legal/terms-of-service",
        about: L10n.text("Your agents generate and edit images with FLUX, the models from Black Forest Labs."),
        L10n.text("Make an image with FLUX of a cozy reading corner for our blog."),
        L10n.text("Change the background of this photo to a beach with FLUX."),
        L10n.text("Generate four logo ideas for a coffee shop with FLUX."))
    case "fal":
      return page("fal", site: "https://fal.ai", privacy: "https://fal.ai/legal/privacy-policy", terms: "https://fal.ai/legal/terms-of-service",
        about: L10n.text("Your agents run AI models for images, video, and audio on fal.ai."),
        L10n.text("Generate a product image on fal.ai with the newest image model."),
        L10n.text("Turn this photo into a short video on fal.ai."),
        L10n.text("Make a voice-over of this paragraph on fal.ai."))
    case "replicate":
      return page("Replicate", site: "https://replicate.com", privacy: "https://replicate.com/privacy", terms: "https://replicate.com/terms",
        about: L10n.text("Your agents run open-source AI models on Replicate."),
        L10n.text("Upscale this photo on Replicate."),
        L10n.text("Find a model on Replicate that removes the background from images."),
        L10n.text("Transcribe this audio file on Replicate."))
    case "creatomate":
      return page("Creatomate", site: "https://creatomate.com", privacy: "https://creatomate.com/privacy-policy", terms: "https://creatomate.com/terms-of-service",
        about: L10n.text("Your agents make videos and images from your templates in Creatomate."),
        L10n.text("Make ten product videos in Creatomate from our spring template."),
        L10n.text("Render a story video in Creatomate with this quote."),
        L10n.text("Which templates do we have in Creatomate?"))
    case "shotstack":
      return page("Shotstack", site: "https://shotstack.io", privacy: "https://shotstack.io/privacy/", terms: "https://shotstack.io/terms/",
        about: L10n.text("Your agents edit and render videos in Shotstack."),
        L10n.text("Join these three clips in Shotstack and add our logo."),
        L10n.text("Render a 15-second promo in Shotstack with this music."),
        L10n.text("Add subtitles to this video in Shotstack."))
    case "bannerbear":
      return page("Bannerbear", site: "https://www.bannerbear.com", privacy: "https://www.bannerbear.com/privacy/", terms: "https://www.bannerbear.com/terms/",
        about: L10n.text("Your agents generate images and videos from your templates in Bannerbear."),
        L10n.text("Make social images in Bannerbear for this week’s five blog posts."),
        L10n.text("Generate a certificate in Bannerbear for each name on this list."),
        L10n.text("Which templates do we have in Bannerbear?"))
    case "cloudinary":
      return page("Cloudinary", site: "https://cloudinary.com", privacy: "https://cloudinary.com/privacy", terms: "https://cloudinary.com/tou",
        about: L10n.text("Your agents upload, organize, and transform your images and videos in Cloudinary."),
        L10n.text("Upload these product photos to the spring folder in Cloudinary."),
        L10n.text("Make square versions of our banner images in Cloudinary."),
        L10n.text("Find every image in Cloudinary tagged homepage."))
    case "sanity":
      return page("Sanity", site: "https://www.sanity.io", privacy: "https://www.sanity.io/legal/privacy", terms: "https://www.sanity.io/legal/tos",
        about: L10n.text("Your agents work with your content, schemas, and documents in Sanity."),
        L10n.text("Which blog posts in Sanity are still drafts?"),
        L10n.text("Update the headline on the home page in Sanity."),
        L10n.text("Add an FAQ document in Sanity about shipping times."))
    case "wistia":
      return page("Wistia", site: "https://wistia.com", privacy: "https://wistia.com/privacy", terms: "https://wistia.com/terms",
        about: L10n.text("Your agents look after your videos, channels, and stats in Wistia."),
        L10n.text("Which videos in Wistia got the most plays this month?"),
        L10n.text("How long do people watch our demo video in Wistia?"),
        L10n.text("Move the webinar recordings into the Webinars project in Wistia."))
    case "captions":
      return page("Captions", site: "https://www.captions.ai", privacy: "https://mirage.app/legal/privacy-policy", terms: "https://mirage.app/legal/captions-web-terms",
        about: L10n.text("Your agents edit talking videos and add captions with AI in Captions."),
        L10n.text("Add captions to this video in Captions."),
        L10n.text("Cut the pauses from my talking video in Captions."),
        L10n.text("Trim this video in Captions to 60 seconds."))
    case "elevenlabs":
      return page("ElevenLabs", site: "https://elevenlabs.io", privacy: "https://elevenlabs.io/privacy-policy", terms: "https://elevenlabs.io/terms-of-use",
        about: L10n.text("Your agents make speech, voices, sound effects, and music in ElevenLabs."),
        L10n.text("Turn this script into a voice-over in ElevenLabs."),
        L10n.text("Make a sound effect in ElevenLabs of a creaking door."),
        L10n.text("Compose a calm 30-second music track in ElevenLabs for our video."))
    case "storyblok":
      return page("Storyblok", site: "https://www.storyblok.com", privacy: "https://www.storyblok.com/legal/privacy-policy", terms: "https://www.storyblok.com/legal/terms",
        about: L10n.text("Your agents work with your stories, components, and assets in Storyblok."),
        L10n.text("Which stories in Storyblok are still unpublished?"),
        L10n.text("Update the headline on the home story in Storyblok."),
        L10n.text("Add these images to our assets in Storyblok."))
    case "coda":
      return page("Superhuman", site: "https://coda.io", privacy: "https://coda.io/trust/privacy", terms: "https://coda.io/trust/tos",
        about: L10n.text("Your agents read and write your docs, tables, and pages in Coda."),
        L10n.text("Add a row to the roadmap table in Coda for the new search feature."),
        L10n.text("Summarize our team handbook in Coda."),
        L10n.text("Which tasks in Coda are assigned to me this week?"))
    case "make":
      return page("Make", site: "https://www.make.com", privacy: "https://www.make.com/privacy-notice", terms: "https://www.make.com/terms-and-conditions",
        about: L10n.text("Your agents run and manage your automation scenarios in Make."),
        L10n.text("Run the new-lead scenario in Make for Jordan from Acme."),
        L10n.text("Which scenarios in Make failed today?"),
        L10n.text("Turn off the weekly report scenario in Make."))
    case "tally":
      return page("Tally", site: "https://tally.so", privacy: "https://tally.so/help/privacy-policy", terms: "https://tally.so/help/terms-and-privacy",
        about: L10n.text("Your agents work with your forms and their submissions in Tally."),
        L10n.text("How many people filled in the waitlist form in Tally this week?"),
        L10n.text("Summarize the answers to our feedback form in Tally."),
        L10n.text("Make a short contact form in Tally with name, email, and message."))
    case "jotform":
      return page("Jotform", site: "https://www.jotform.com", privacy: "https://www.jotform.com/privacy/", terms: "https://www.jotform.com/terms/",
        about: L10n.text("Your agents work with your forms and their submissions in Jotform."),
        L10n.text("Show me today’s submissions to the booking form in Jotform."),
        L10n.text("How many people signed up through our event form in Jotform?"),
        L10n.text("Make an order form in Jotform with three products."))
    case "surveymonkey":
      return page("SurveyMonkey", site: "https://www.surveymonkey.com", privacy: "https://www.surveymonkey.com/mp/legal/privacy/", terms: "https://www.surveymonkey.com/mp/legal/terms-of-use/",
        about: L10n.text("Your agents work with your surveys and their responses in SurveyMonkey."),
        L10n.text("Summarize the responses to our customer survey in SurveyMonkey."),
        L10n.text("What’s the average rating in SurveyMonkey for last month’s survey?"),
        L10n.text("Make a five-question survey in SurveyMonkey about our new menu."))
    case "canny":
      return page("Canny", site: "https://canny.io", privacy: "https://canny.io/privacy", terms: "https://canny.io/terms",
        about: L10n.text("Your agents work with feature requests, votes, and your roadmap in Canny. Pro plan."),
        L10n.text("Which feature requests in Canny have the most votes?"),
        L10n.text("Add this customer’s idea to our board in Canny."),
        L10n.text("What’s planned on our roadmap in Canny for next month?"))
    case "fireflies":
      return page("Fireflies", site: "https://fireflies.ai", privacy: "https://fireflies.ai/privacy", terms: "https://fireflies.ai/terms-of-service",
        about: L10n.text("Your agents read your meeting transcripts, summaries, and action items in Fireflies."),
        L10n.text("Summarize today’s calls in Fireflies."),
        L10n.text("What action items came out of the Acme meeting in Fireflies?"),
        L10n.text("Find the meeting in Fireflies where we talked about pricing."))
    case "tldv":
      return page("tl;dv", site: "https://tldv.io", privacy: "https://tldv.io/privacy/", terms: "https://tldv.io/terms/",
        about: L10n.text("Your agents read your meeting recordings and notes in tl;dv. Read-only, Pro plan."),
        L10n.text("Summarize yesterday’s team meeting in tl;dv."),
        L10n.text("What did the client ask for in last week’s call in tl;dv?"),
        L10n.text("Find the meetings in tl;dv where someone mentioned the deadline."))
    case "avoma":
      return page("Avoma", site: "https://www.avoma.com", privacy: "https://www.avoma.com/privacy-policy", terms: "https://www.avoma.com/terms",
        about: L10n.text("Your agents read your meeting notes, transcripts, and deal insights in Avoma."),
        L10n.text("Summarize my last sales call in Avoma."),
        L10n.text("What risks did Avoma find in the Acme deal?"),
        L10n.text("Find the meetings in Avoma where pricing came up this month."))
    case "missive":
      return page("Missive", site: "https://missiveapp.com", privacy: "https://missiveapp.com/privacy", terms: "https://missiveapp.com/terms",
        about: L10n.text("Your agents read and draft conversations, and manage tasks in your team inbox in Missive."),
        L10n.text("What’s waiting for a reply in our shared inbox in Missive?"),
        L10n.text("Draft a reply in Missive to the latest message from Acme."),
        L10n.text("Make a task in Missive to follow up with Jordan on Friday."))
    case "mixmax":
      return page("Mixmax", site: "https://www.mixmax.com", privacy: "https://www.mixmax.com/legal/privacy-policy", terms: "https://www.mixmax.com/legal/terms-of-service",
        about: L10n.text("Your agents work with your email sequences, meetings, and tracking in Mixmax."),
        L10n.text("Who opened my last email in Mixmax?"),
        L10n.text("Add Jordan to the onboarding sequence in Mixmax."),
        L10n.text("Which sequence in Mixmax gets the most replies?"))
    case "close":
      return page("Close", site: "https://www.close.com", privacy: "https://close.com/privacy", terms: "https://close.com/terms",
        about: L10n.text("Your agents work with your leads, contacts, opportunities, and calls in Close."),
        L10n.text("Which leads in Close haven’t been contacted this week?"),
        L10n.text("Add Acme as a lead in Close with Jordan as the contact."),
        L10n.text("Summarize today’s calls in Close."))
    case "hunter":
      return page("Hunter", site: "https://hunter.io", privacy: "https://hunter.io/privacy-policy", terms: "https://hunter.io/terms-of-service",
        about: L10n.text("Your agents find and verify professional email addresses with Hunter."),
        L10n.text("Find Jordan Lee’s email at acme.com with Hunter."),
        L10n.text("Verify these five email addresses with Hunter."),
        L10n.text("Find people in marketing at acme.com with Hunter."))
    case "lusha":
      return page("Lusha", site: "https://www.lusha.com", privacy: "https://www.lusha.com/legal/privacy-policy/", terms: "https://www.lusha.com/terms_and_conditions",
        about: L10n.text("Your agents find contact and company data for prospecting in Lusha."),
        L10n.text("Find Jordan Lee’s work phone number at Acme in Lusha."),
        L10n.text("Find ten marketing directors at fintech companies in Lusha."),
        L10n.text("How many people work at Acme, according to Lusha?"))
    case "aircall":
      return page("Aircall", site: "https://aircall.io", privacy: "https://aircall.io/privacy/", terms: "https://aircall.io/terms-of-use/",
        about: L10n.text("Your agents look up your team’s calls and their details in Aircall."),
        L10n.text("How many calls did we miss today in Aircall?"),
        L10n.text("Summarize Sam’s calls this morning in Aircall."),
        L10n.text("Who called us most this week in Aircall?"))
    case "workable":
      return page("Workable", site: "https://www.workable.com", privacy: "https://www.workable.com/privacy", terms: "https://www.workable.com/terms",
        about: L10n.text("Your agents work with your jobs, candidates, and hiring pipeline in Workable."),
        L10n.text("Which candidates in Workable are waiting for an interview?"),
        L10n.text("How many people applied to the designer job in Workable this week?"),
        L10n.text("Move Sam to the offer stage in Workable."))
    case "breezy-hr":
      return page("Breezy HR", site: "https://breezy.hr", privacy: "https://breezy.hr/privacy", terms: "https://breezy.hr/policies/terms",
        about: L10n.text("Your agents work with your positions, candidates, and pipeline in Breezy HR."),
        L10n.text("How many candidates applied to the barista position in Breezy HR?"),
        L10n.text("Which candidates in Breezy HR have waited longest?"),
        L10n.text("Add this résumé to the sales position in Breezy HR."))
    case "postman":
      return page("Postman", site: "https://www.postman.com", privacy: "https://www.postman.com/legal/privacy-policy/", terms: "https://www.postman.com/legal/terms/",
        about: L10n.text("Your agents work with your APIs, collections, and workspaces in Postman."),
        L10n.text("List the requests in our payments collection in Postman."),
        L10n.text("Add a request for the profile endpoint to the users collection in Postman."),
        L10n.text("Which workspaces do we have in Postman?"))
    case "railway":
      return page("Railway", site: "https://railway.com", privacy: "https://railway.com/legal/privacy", terms: "https://railway.com/legal/terms",
        about: L10n.text("Your agents look after your projects, services, deploys, and logs on Railway."),
        L10n.text("Did the last deploy on Railway succeed?"),
        L10n.text("Show me the last hour of logs for the API on Railway."),
        L10n.text("Restart the worker service on Railway."))
    case "datadog":
      return page("Datadog", site: "https://www.datadoghq.com", privacy: "https://www.datadoghq.com/legal/privacy/", terms: "https://www.datadoghq.com/legal/msa/",
        about: L10n.text("Your agents read your logs, metrics, monitors, and incidents in Datadog. US1 site."),
        L10n.text("Which monitors in Datadog are alerting right now?"),
        L10n.text("Show me the checkout service’s errors from the last hour in Datadog."),
        L10n.text("Summarize this week’s incidents in Datadog."))
    case "tavily":
      return page("Tavily", site: "https://www.tavily.com", privacy: "https://www.tavily.com/privacy", terms: "https://www.tavily.com/terms",
        about: L10n.text("Your agents search the web and pull the text of pages with Tavily."),
        L10n.text("Search the web with Tavily for this week’s news about our competitors."),
        L10n.text("Pull the text of this article with Tavily and summarize it."),
        L10n.text("Find three reviews of the new espresso machine with Tavily."))
    case "exa":
      return page("Exa", site: "https://exa.ai", privacy: "https://exa.ai/privacy-policy", terms: "https://exa.ai/terms",
        about: L10n.text("Your agents search the web and read the contents of pages with Exa."),
        L10n.text("Find startups building software for dentists with Exa."),
        L10n.text("Find recent research on sleep and memory with Exa."),
        L10n.text("Read this page with Exa and list its main points."))
    case "shortcut":
      return page("Shortcut", site: "https://www.shortcut.com", privacy: "https://www.shortcut.com/privacy", terms: "https://www.shortcut.com/terms",
        about: L10n.text("Your agents work with your stories, epics, and iterations in Shortcut."),
        L10n.text("What stories are in the current iteration in Shortcut?"),
        L10n.text("Make a story in Shortcut for the login bug."),
        L10n.text("Which epics in Shortcut are behind schedule?"))
    case "razorpay":
      return page("Razorpay", site: "https://razorpay.com", privacy: "https://razorpay.com/privacy/", terms: "https://razorpay.com/terms/",
        about: L10n.text("Your agents look up payments, orders, refunds, and settlements in Razorpay."),
        L10n.text("How much did we collect in Razorpay today?"),
        L10n.text("Refund the payment from lea@acme.com in Razorpay."),
        L10n.text("When is the next settlement in Razorpay?"))
    case "coinbase":
      return page("Coinbase", site: "https://www.coinbase.com", privacy: "https://www.coinbase.com/legal/privacy", terms: "https://www.coinbase.com/legal/user_agreement/united_states",
        about: L10n.text("Your agents trade and manage a portfolio in your Coinbase account through Coinbase for Agents, within the limits you set."),
        L10n.text("What’s in my agent portfolio on Coinbase?"),
        L10n.text("Preview an order on Coinbase to buy $50 of bitcoin."),
        L10n.text("Place a limit order on Coinbase to buy $100 of ETH at $3,000."))
    case "typefully":
      return page("Typefully", site: "https://typefully.com", privacy: "https://typefully.com/privacy", terms: "https://typefully.com/terms",
        about: L10n.text("Your agents draft, schedule, and publish your posts to X, LinkedIn, and Threads in Typefully."),
        L10n.text("Draft a thread in Typefully about our launch."),
        L10n.text("Schedule this post in Typefully for tomorrow at 9."),
        L10n.text("What’s in my queue in Typefully this week?"))
    case "crunchbase":
      return page("Crunchbase", site: "https://www.crunchbase.com", privacy: "https://about.crunchbase.com/privacy-policy/", terms: "https://about.crunchbase.com/terms-of-service/",
        about: L10n.text("Your agents look up companies, funding rounds, investors, and the people behind them in Crunchbase."),
        L10n.text("How much has Acme raised, according to Crunchbase?"),
        L10n.text("Which seed investors in Crunchbase back climate startups?"),
        L10n.text("Find fintech startups in Crunchbase that raised a Series A this year."))
    case "gem":
      return page("Gem", site: "https://www.gem.com", privacy: "https://www.gem.com/privacy", terms: "https://www.gem.com/terms",
        about: L10n.text("Your agents source candidates, and manage your talent pipeline and outreach in Gem."),
        L10n.text("Find ten senior designers in Gem for our open role."),
        L10n.text("Add these candidates to the engineering project in Gem."),
        L10n.text("Which outreach sequence in Gem gets the most replies?"))
    case "meta-ads":
      return page("Meta", site: "https://www.facebook.com/business/ads", privacy: "https://www.facebook.com/privacy/policy/", terms: "https://www.facebook.com/legal/commercial_terms",
        about: L10n.text("Your agents read and manage your campaigns, ad sets, and ads on Facebook and Instagram in Meta Ads."),
        L10n.text("How did our campaigns in Meta Ads do last week?"),
        L10n.text("Pause the ad sets in Meta Ads with a cost per purchase over $30."),
        L10n.text("Which ad in Meta Ads has the best click rate this month?"))
    case "loop-returns":
      return page("Loop", site: "https://www.loopreturns.com", privacy: "https://www.loopreturns.com/legal/privacy-notice/", terms: "https://www.loopreturns.com/legal/terms/",
        about: L10n.text("Your agents handle returns, exchanges, and refunds for your Shopify store in Loop Returns."),
        L10n.text("How many returns came in this week in Loop Returns?"),
        L10n.text("Approve the exchange for order 1042 in Loop Returns."),
        L10n.text("What’s the most returned product this month in Loop Returns?"))
    case "upwork":
      return page("Upwork", site: "https://www.upwork.com", privacy: "https://www.upwork.com/legal#privacy", terms: "https://www.upwork.com/legal#terms",
        about: L10n.text("Your agents work with your jobs, freelancers, proposals, and contracts on Upwork."),
        L10n.text("Post a job on Upwork for a logo designer with a $500 budget."),
        L10n.text("Summarize the proposals for our job on Upwork."),
        L10n.text("Which contracts on Upwork end this month?"))
    case "courtlistener":
      return page("Free Law Project", site: "https://www.courtlistener.com", privacy: "https://www.courtlistener.com/terms/", terms: "https://www.courtlistener.com/terms/",
        about: L10n.text("Your agents search case law, court dockets, and judges in CourtListener, from the Free Law Project."),
        L10n.text("Find recent appeals court cases in CourtListener on non-compete agreements."),
        L10n.text("Show me the latest filings in this docket in CourtListener."),
        L10n.text("Which cases did Judge Rivera decide this year in CourtListener?"))
    case "karbon":
      return page("Karbon", site: "https://karbonhq.com", privacy: "https://karbonhq.com/privacy-policy/", terms: "https://karbonhq.com/terms-of-use/",
        about: L10n.text("Your agents work with your accounting practice’s clients, work, and deadlines in Karbon."),
        L10n.text("Which client work in Karbon is due this week?"),
        L10n.text("What’s overdue for the Acme account in Karbon?"),
        L10n.text("Make a task in Karbon to send Lea her tax documents."))
    case "ignition":
      return page("Ignition", site: "https://www.ignitionapp.com", privacy: "https://www.ignitionapp.com/privacy", terms: "https://www.ignitionapp.com/terms",
        about: L10n.text("Your agents work with proposals, engagement letters, billing, and payments for your firm in Ignition."),
        L10n.text("Which proposals in Ignition are waiting for the client to accept?"),
        L10n.text("Send a proposal in Ignition to Acme for monthly bookkeeping."),
        L10n.text("Which payments in Ignition failed this month?"))
    case "appfolio":
      return page("AppFolio", site: "https://www.appfolio.com", privacy: "https://www.appfolio.com/privacy", terms: "https://www.appfolio.com/terms",
        about: L10n.text("Your agents work with your properties, units, tenants, and work orders in AppFolio."),
        L10n.text("Which units in AppFolio are vacant right now?"),
        L10n.text("List the open work orders in AppFolio for the Elm Street building."),
        L10n.text("Which tenants in AppFolio are late on rent this month?"))
    case "jobber":
      return page("Jobber", site: "https://www.getjobber.com", privacy: "https://www.getjobber.com/privacy-policy/", terms: "https://www.getjobber.com/terms-of-service/",
        about: L10n.text("Your agents work with your clients, quotes, jobs, and invoices in Jobber."),
        L10n.text("Make a quote in Jobber for Lea’s kitchen repaint."),
        L10n.text("Which jobs in Jobber are scheduled for tomorrow?"),
        L10n.text("Which invoices in Jobber are still unpaid?"))
    case "companycam":
      return page("CompanyCam", site: "https://companycam.com", privacy: "https://companycam.com/privacy-notice", terms: "https://companycam.com/terms",
        about: L10n.text("Your agents work with your job site photos, projects, and checklists in CompanyCam."),
        L10n.text("Show me today’s photos from the Elm Street project in CompanyCam."),
        L10n.text("Which checklists in CompanyCam are still open?"),
        L10n.text("Make a project in CompanyCam for the new roof at 12 Oak Lane."))
    case "uber":
      return page("Uber", site: "https://www.uber.com", privacy: "https://www.uber.com/legal/en/document/?name=privacy-notice&country=united-states&lang=en", terms: "https://www.uber.com/legal/en/document/?name=general-terms-of-use&country=united-states&lang=en",
        about: L10n.text("Your agents check ride prices and times in Uber, and send you a link to book the ride."),
        L10n.text("How much is a ride from the office to the airport in Uber right now?"),
        L10n.text("Send me a link to book an Uber to the train station."),
        L10n.text("How long would a ride downtown take in Uber?"))
    case "instacart":
      return page("Instacart", site: "https://www.instacart.com", privacy: "https://www.instacart.com/privacy", terms: "https://www.instacart.com/terms",
        about: L10n.text("Your agents turn your recipes and shopping lists into Instacart pages you can order from."),
        L10n.text("Turn this lasagna recipe into a shopping list on Instacart."),
        L10n.text("Make an Instacart list for this week’s groceries."),
        L10n.text("Put everything for taco night on one page on Instacart."))
    case "taskrabbit":
      return page("TaskRabbit", site: "https://www.taskrabbit.com", privacy: "https://www.taskrabbit.com/privacy", terms: "https://www.taskrabbit.com/terms",
        about: L10n.text("Your agents find Taskers near you on TaskRabbit for jobs around the home, and start a booking."),
        L10n.text("Find a Tasker on TaskRabbit to assemble a bed this Saturday."),
        L10n.text("How much does furniture assembly cost near me on TaskRabbit?"),
        L10n.text("Start a booking on TaskRabbit for help moving a sofa."))
    case "bamboohr":
      return page("BambooHR", site: "https://www.bamboohr.com", privacy: "https://www.bamboohr.com/legal/privacy-policy", terms: "https://www.bamboohr.com/legal/terms-of-service",
        about: L10n.text("Your agents look up employees, time off, job openings, and applicants in BambooHR."),
        L10n.text("Who’s off next week in BambooHR?"),
        L10n.text("How many vacation days does Sam have left in BambooHR?"),
        L10n.text("List the applicants for the marketing opening in BambooHR."))
    case "7shifts":
      return page("7shifts", site: "https://www.7shifts.com", privacy: "https://www.7shifts.com/privacy-policy/", terms: "https://www.7shifts.com/terms-of-service/",
        about: L10n.text("Your agents see your shifts, locations, and restaurant team in 7shifts."),
        L10n.text("Who’s working the dinner shift tonight in 7shifts?"),
        L10n.text("List this week’s shifts at the downtown location in 7shifts."),
        L10n.text("Who works at the Main Street location in 7shifts?"))
    case "veryfi":
      return page("Veryfi", site: "https://www.veryfi.com", privacy: "https://www.veryfi.com/privacy/", terms: "https://www.veryfi.com/terms/",
        about: L10n.text("Your agents read your receipts, invoices, and bills into data with Veryfi."),
        L10n.text("Read this receipt with Veryfi and tell me the total and the tax."),
        L10n.text("Read these five invoices with Veryfi and list each total."),
        L10n.text("Find last month’s fuel receipts in Veryfi."))
    case "yelp":
      return page("Yelp", site: "https://www.yelp.com", privacy: "https://terms.yelp.com/privacy/", terms: "https://terms.yelp.com/tos/",
        about: L10n.text("Your agents find businesses and events, and read reviews and ratings on Yelp."),
        L10n.text("Find the best-rated sushi near our office on Yelp."),
        L10n.text("What do reviews on Yelp say about Café Lumen?"),
        L10n.text("Find events in Austin this weekend on Yelp."))
    case "tiktok":
      return page("TikTok", site: "https://www.tiktok.com", privacy: "https://www.tiktok.com/legal/page/us/privacy-policy/en", terms: "https://www.tiktok.com/legal/page/us/terms-of-service/en",
        about: L10n.text("Your agents post videos and photos to TikTok, and read your videos and stats."),
        L10n.text("Post this video to TikTok with the caption “Behind the scenes”."),
        L10n.text("Which of my videos on TikTok got the most views this month?"),
        L10n.text("How many followers did I gain on TikTok this week?"))
    case "follow-up-boss":
      return page("Follow Up Boss", site: "https://www.followupboss.com", privacy: "https://www.followupboss.com/legal-pages/privacy-policy", terms: "https://www.followupboss.com/legal-pages/terms-of-service",
        about: L10n.text("Your agents work with your leads, people, deals, and appointments in Follow Up Boss."),
        L10n.text("Which new leads came into Follow Up Boss today?"),
        L10n.text("Book a showing in Follow Up Boss with Lea for Saturday at 11."),
        L10n.text("Which deals in Follow Up Boss are under contract?"))
    case "matterport":
      return page("Matterport", site: "https://matterport.com", privacy: "https://matterport.com/legal/privacy-policy", terms: "https://matterport.com/terms-of-use",
        about: L10n.text("Your agents look up your 3D tours and the spaces in them in Matterport."),
        L10n.text("List my 3D tours in Matterport."),
        L10n.text("Which rooms are in the Elm Street tour in Matterport?"),
        L10n.text("Turn off last year’s old tours in Matterport."))
    case "zoho-inventory":
      return page("Zoho", site: "https://www.zoho.com/inventory/", privacy: "https://www.zoho.com/privacy.html", terms: "https://www.zoho.com/terms.html",
        about: L10n.text("Your agents work with your items, stock, sales orders, and invoices in Zoho Inventory."),
        L10n.text("Which items in Zoho Inventory are below their reorder level?"),
        L10n.text("Make a sales order in Zoho Inventory for Acme: 20 mugs."),
        L10n.text("Email the invoice for order 1042 to the customer from Zoho Inventory."))
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
  public static let written = ["gmail", "google-calendar", "google-drive", "outlook", "slack", "notion", "github", "linear", "dropbox", "hubspot", "airtable", "asana", "clickup", "monday", "todoist", "zoom", "google-meet", "figma", "canva", "miro", "webflow", "wix", "stripe", "paypal", "square", "ramp", "quickbooks", "salesforce", "intercom", "apollo", "jira", "vercel", "supabase", "sentry", "cloudflare", "mailchimp", "greenhouse", "gusto", "linkedin", "google-docs", "google-sheets", "google-slides", "onedrive", "google-tasks", "trello", "xero", "shopify", "brex", "pipedrive", "docusign", "klaviyo", "ashby", "google-analytics", "google-search-console", "youtube", "kit", "instagram", "facebook", "calendly", "cal-com", "attio", "zendesk", "microsoft-teams", "discord", "mercury", "posthog", "google-ads", "tiktok-ads", "microsoft-excel", "reddit", "pinterest", "gumroad", "google-classroom", "gorgias", "gong", "capsule-crm", "dialpad", "link", "granola", "resend", "sharepoint", "onenote", "microsoft-to-do", "lovable", "shop", "whatsapp", "twitch", "reddit-ads", "pinterest-ads", "omnisend", "dub", "eventbrite", "google-photos", "mural", "zeplin", "contentful", "box", "confluence", "notebooklm", "basecamp", "wrike", "ticktick", "harvest", "typeform", "productboard", "google-maps", "webex", "fathom", "freshbooks", "ynab", "splitwise", "shippo", "dynamics-365", "gitlab", "bitbucket", "pagerduty", "google-bigquery", "hugging-face", "excalidraw", "heygen", "higgsfield", "gamma", "descript", "lucid", "eraser", "mobbin", "magic-patterns", "pandadoc", "otter", "read-ai", "fellow", "plaid", "clay", "netlify", "neon", "beehiiv", "mailerlite", "getresponse", "customer-io", "lemlist", "mixpanel", "amplitude", "bitly", "ahrefs", "moz", "dataforseo", "semrush", "brevo", "runway", "black-forest-labs", "fal", "replicate", "creatomate", "shotstack", "bannerbear", "cloudinary", "sanity", "wistia", "captions", "elevenlabs", "storyblok", "coda", "make", "tally", "jotform", "surveymonkey", "canny", "fireflies", "tldv", "avoma", "missive", "mixmax", "close", "hunter", "lusha", "aircall", "workable", "breezy-hr", "postman", "railway", "datadog", "tavily", "exa", "shortcut", "razorpay", "coinbase", "typefully", "crunchbase", "gem", "meta-ads", "loop-returns", "upwork", "courtlistener", "karbon", "ignition", "appfolio", "jobber", "companycam", "uber", "instacart", "taskrabbit", "bamboohr", "7shifts", "veryfi", "yelp", "tiktok", "follow-up-boss", "matterport", "zoho-inventory"]
}
