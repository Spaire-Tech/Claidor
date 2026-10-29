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
      return ConnectorPage(
        maker: "Google",
        about: L10n.text("Your agents search and read your email in Gmail, summarize long threads, and draft replies for you to check before anything is sent."),
        examples: [
          L10n.text("Summarize the last five emails from my accountant in Gmail and list what needs a reply."),
          L10n.text("Draft a polite reply in Gmail to the latest invoice email, asking for a new due date."),
          L10n.text("Find every Gmail thread about the lease this month and pull out the key dates."),
        ],
        website: URL(string: "https://workspace.google.com/products/gmail/"), privacy: google.privacy, terms: google.terms)
    case "google-calendar":
      return ConnectorPage(
        maker: "Google",
        about: L10n.text("Your agents read your Google Calendar, find free time, and schedule or move meetings for you."),
        examples: [
          L10n.text("Find a free hour next week in Google Calendar for a call with Sam and send the invite."),
          L10n.text("What’s on my Google Calendar tomorrow, and which meetings could move?"),
          L10n.text("Block two hours of focus time every morning this week in Google Calendar."),
        ],
        website: URL(string: "https://workspace.google.com/products/calendar/"), privacy: google.privacy, terms: google.terms)
    case "google-drive":
      return ConnectorPage(
        maker: "Google",
        about: L10n.text("Your agents find, read, and create files in Google Drive, and share them with the people you name."),
        examples: [
          L10n.text("Find the latest budget sheet in Google Drive and tell me what changed since last month."),
          L10n.text("Put this week’s meeting notes in a new doc in Google Drive and share it with the team."),
          L10n.text("List the files in Google Drive I haven’t opened in a year, so I can clean up."),
        ],
        website: URL(string: "https://workspace.google.com/products/drive/"), privacy: google.privacy, terms: google.terms)
    case "outlook":
      return ConnectorPage(
        maker: "Microsoft",
        about: L10n.text("Your agents read and sort your email in Outlook, draft replies, and keep your Microsoft 365 calendar up to date."),
        examples: [
          L10n.text("Go through my Outlook inbox and flag anything from clients that’s still waiting on me."),
          L10n.text("Reply in Outlook to Jordan’s last email and suggest Thursday at 10 instead."),
          L10n.text("Find the contract someone sent me in Outlook last month and summarize it."),
        ],
        website: URL(string: "https://www.microsoft.com/microsoft-365/outlook"),
        privacy: URL(string: "https://privacy.microsoft.com/privacystatement"), terms: URL(string: "https://www.microsoft.com/servicesagreement"))
    case "slack":
      return ConnectorPage(
        maker: "Slack",
        about: L10n.text("Your agents read your channels and messages in Slack, catch you up, and post for you when you ask."),
        examples: [
          L10n.text("Catch me up on #marketing in Slack since Monday, in five points."),
          L10n.text("Post the launch checklist in Slack and ask who can take each item."),
          L10n.text("Find what the team decided about pricing in Slack last week."),
        ],
        website: URL(string: "https://slack.com"),
        privacy: URL(string: "https://slack.com/trust/privacy/privacy-policy"), terms: URL(string: "https://slack.com/main-services-agreement"))
    case "notion":
      return ConnectorPage(
        maker: "Notion",
        about: L10n.text("Your agents search, read, and write your pages and databases in Notion."),
        examples: [
          L10n.text("Turn these notes into a project page in Notion with owners and due dates."),
          L10n.text("Find our onboarding checklist in Notion and tell me what’s out of date."),
          L10n.text("Add today’s sales calls to our CRM database in Notion."),
        ],
        website: URL(string: "https://www.notion.com"),
        privacy: URL(string: "https://www.notion.so/notion/Privacy-Policy-3468d120cf614d4c9014c09f6adc9091"),
        terms: URL(string: "https://www.notion.so/notion/Terms-and-Privacy-28ffdd083dc3473e9c2da6ec011b58ac"))
    case "github":
      return ConnectorPage(
        maker: "GitHub",
        about: L10n.text("Your agents work in your repositories on GitHub: they read code, open issues, and review pull requests."),
        examples: [
          L10n.text("Summarize the open pull requests on GitHub that are waiting on my review."),
          L10n.text("Open an issue on GitHub for the login bug, with the steps to reproduce it."),
          L10n.text("What shipped in our GitHub repo this week? Write it up as release notes."),
        ],
        website: URL(string: "https://github.com"),
        privacy: URL(string: "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"),
        terms: URL(string: "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service"))
    case "linear":
      return ConnectorPage(
        maker: "Linear",
        about: L10n.text("Your agents create and update issues in Linear and tell you where your projects and cycles stand."),
        examples: [
          L10n.text("Create Linear issues for each bug in this list and assign them to me."),
          L10n.text("What’s left in the current cycle in Linear, and what’s at risk?"),
          L10n.text("Move every Linear issue I finished today to Done."),
        ],
        website: URL(string: "https://linear.app"), privacy: URL(string: "https://linear.app/privacy"), terms: URL(string: "https://linear.app/terms"))
    case "dropbox":
      return ConnectorPage(
        maker: "Dropbox",
        about: L10n.text("Your agents find, read, and organize your files in Dropbox."),
        examples: [
          L10n.text("Find the signed lease in Dropbox and tell me when it ends."),
          L10n.text("Make a folder in Dropbox for the Smith project and put these files in it."),
          L10n.text("List what takes the most space in my Dropbox."),
        ],
        website: URL(string: "https://www.dropbox.com"), privacy: URL(string: "https://www.dropbox.com/privacy"), terms: URL(string: "https://www.dropbox.com/terms"))
    case "hubspot":
      return ConnectorPage(
        maker: "HubSpot",
        about: L10n.text("Your agents look up and update your contacts, companies, and deals in HubSpot."),
        examples: [
          L10n.text("Find the deals in HubSpot that haven’t moved in two weeks and draft a follow-up for each."),
          L10n.text("Add the people from today’s event to HubSpot as contacts."),
          L10n.text("Sum up what we know about Acme in HubSpot before my call."),
        ],
        website: URL(string: "https://www.hubspot.com"),
        privacy: URL(string: "https://legal.hubspot.com/privacy-policy"), terms: URL(string: "https://legal.hubspot.com/terms-of-service"))
    default:
      return nil
    }
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

  /** Google's policies, the same for Gmail, Calendar and Drive. */
  private static let google = (privacy: URL(string: "https://policies.google.com/privacy"), terms: URL(string: "https://policies.google.com/terms"))

  /** The connectors written so far, for the tests. */
  public static let written = ["gmail", "google-calendar", "google-drive", "outlook", "slack", "notion", "github", "linear", "dropbox", "hubspot"]
}
