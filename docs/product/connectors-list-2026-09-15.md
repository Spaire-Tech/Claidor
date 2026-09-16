# The connectors — a new list, 15 September 2026

> **Cut on 16 September 2026.** The founder: *"remove all the junks in
> connectors … i want nothing that is browser. or that cant be connected.
> its noise. cause what is it doing there? it says plugins, so you should
> plug it … no social media either … leave linkedin."* The catalogue
> (`desktop/src/shared/connections/catalog.ts`) now holds forty-five
> cards and every one is a Connect button that works. The list below is
> the survey the forty-five were chosen from, kept as the record of what
> was checked and how; it is no longer what the app shows. The kept
> forty-five are in `docs/product/review.md` item 54.

The founder: *"give me a brand new list of connectors we should use.
notion, zoom, etc. i want a full list i want categories. where we can
use skills."*

Every "route" below was checked today, not remembered. **Self** means
the vendor runs its own MCP server and lets a client register itself,
so the engine signs the person in with nothing from us
(`connectors-probe-2026-09-15.txt`, `-new-list.txt`). **Own client**
means the vendor runs an MCP server but wants a client we register with
them first. **Channel** means the engine already carries the plugin
(`openclaw/extensions/<id>`) and the service is a way to reach the
agent, not an account it reads. **Browser** means no API worth having;
the agent uses the person's own signed-in browser. **Local** means it
is on this Mac. **None** means no vendor MCP was found; those wait.

Skills are the bundled ones (`desktop/SKILLs/`) where we have them, and
Grok Bot's managed-skill names where we do not — those are ours to
write, with the contract's one-line description as the brief.

## 1. Mail & Calendar — skills: `scheduling`, `send-on-behalf`, `imap-smtp-email`

| Service | Route | Note |
|---|---|---|
| Gmail | Own client (Google) | Testing status: 100 people, 7-day re-sign-in; verification later |
| Google Calendar | Own client (Google) | same client |
| Outlook & Microsoft 365 Calendar | Own client (Microsoft) | no public vendor MCP; Graph API with our Azure app |
| Any IMAP mailbox (Fastmail, iCloud, work mail) | Channel + skill | the `@clawemail/email` plugin the app installs (`package.json`, `openclaw.plugins`) — not an engine extension, as an earlier line here said; bundled `imap-smtp-email` skill |
| Apple Calendar | Local | macOS |
| Calendly | Self | |

## 2. Messaging — skills: `channels`, `send-on-behalf`, `group-chat-turns`

| Service | Route | Note |
|---|---|---|
| WhatsApp | Channel | engine `whatsapp`; not yet in the app's channel settings |
| Telegram | Channel | wired today |
| Discord | Channel | wired today |
| iMessage | Channel | engine `imessage`, macOS |
| Signal | Channel | engine `signal`; not yet in settings |
| Slack | Channel + Own client | engine `slack` for reach; Slack's MCP wants a registered app |
| Microsoft Teams | Channel + Own client | engine `msteams`; Graph for the rest |
| Google Chat | Channel | engine `googlechat` |

## 3. Files & Docs — skills: `docx`, `xlsx`, `pptx`, `pdf`

| Service | Route |
|---|---|
| Notion | Self |
| Google Drive | Own client (Google) |
| Dropbox | Self |
| Box | Own client |
| OneDrive | Own client (Microsoft) |
| Coda, Craft, Mem, Readwise, Guru | Self |
| Word, Excel, PowerPoint, PDF | Local + skill |
| Apple Notes | Local |

## 4. Productivity & Tasks — skill: `routines`

| Service | Route |
|---|---|
| Todoist, Asana, monday, ClickUp, Linear, Airtable | Self |
| Jira & Confluence (Atlassian) | Self |
| Typeform, Jotform | Self |
| Trello | Unknown — refused the probe (403) |
| Smartsheet, Wrike | Token pasted (a screen to build) |
| Google Tasks | Own client (Google) |
| Apple Reminders | Local |

## 5. Meetings

| Service | Route |
|---|---|
| Zoom | Own client |
| Google Meet | Own client (Google); engine `google-meet` plugin for the call itself |
| Fathom, Otter, Fireflies, Circleback | Self |
| Loom | None |

## 6. Design & Creativity — skills: `canvas-design`, `frontend-design`, `remotion`, `seedream`, `seedance`

| Service | Route |
|---|---|
| Figma, Canva, Miro, Gamma, Webflow, Wix | Self |
| Excalidraw | Open — no sign-in at all |
| Adobe Express | Browser |
| YouTube Studio | Browser |

## 7. Finance & Payments — skills: `stock-analyzer`, `stock-explorer`, `stock-announcements`

| Service | Route |
|---|---|
| Stripe, PayPal, Square | Self |
| Brex, Mercury, Ramp, Navan | Self |
| Interactive Brokers, Webull, Daloopa, S&P Global | Self |
| Xero | Own client (their local server) |
| QuickBooks | None found (their host answered 502) |
| Shopify | Browser, or per-store token |
| Amazon Seller | Browser |

## 8. Marketing & Growth

| Service | Route |
|---|---|
| Klaviyo, Customer.io, MailerLite, Meltwater, Profound, Ahrefs, Semrush, Apollo | Self |
| GoDaddy | Open — no sign-in |
| Brevo, Similarweb, Hunter | Token pasted |
| X Ads | Own client (X) |
| Mailchimp | None found |

## 9. Sales & Customers

| Service | Route |
|---|---|
| Attio, Clay, Outreach, Amplemarket, Gong, Upwork | Self |
| HubSpot | Own client |
| Intercom | Own client |
| Docusign | Own client (refused the probe, 403) |
| Salesforce | None found; Pipedream or their connected app |
| Pipedrive | Unknown — 401 with no metadata |

## 10. Hiring & People

| Service | Route |
|---|---|
| Ashby, Workable, Greenhouse, Juicebox | Self |
| Rippling | Own client |
| Gusto, Deel, BambooHR, Lever | None found |

## 11. Social — skill: Cursor's `x-api-mcp-guide` (MIT) for X

| Service | Route |
|---|---|
| X | Own client (X); Cursor's plugin ships its own client id, which is theirs |
| LinkedIn, Instagram, TikTok, YouTube, Facebook | Browser |

## 12. Shopping & Travel — skills: `shopping`, `purchases`, `flight-booking`, `restaurant-booking`, `restaurant-recommendations`, `food-ordering`, `rideshare`, `in-chat-forms`

All browser: Amazon, Google Flights, Airbnb, Booking, OpenTable,
DoorDash, Uber. This is the category where the skills are the product;
the sites have no connector and Grok Bot's list says so.

## 13. Developer & Automation — skill: `playwright`

| Service | Route |
|---|---|
| Vercel, Supabase, Sentry, Cloudflare, Zapier, Make, DeepL | Self |
| GitHub | Own client, or a token pasted |
| GitLab | None found; Pipedream |
| Playwright | Local |

## 14. Knowledge & Web — skills: `web-search`, `weather`, `technology-news-search`, `daily-trending`, `films-search`, `music-search`

Built into the engine: web search, page reading. Perplexity is an
engine provider plugin, not a connector.

## The counts

| Route | Services |
|---|---|
| Self — works with nothing from us | 63 |
| Own client — one registration each | 13 (Google ×5 share one) |
| Channel — engine plugin | 8 |
| Browser | 15 |
| Local | 6 |
| Token pasted | 6 |
| None found | 9 |

## What the skills need

Grok Bot's twenty skills exist as names and one-line briefs (contract
§21.2). Ten of them belong to categories above and are worth writing
first, in this order: `scheduling`, `send-on-behalf`, `routines`,
`channels`, `shopping`, `purchases`, `in-chat-forms`, `flight-booking`,
`restaurant-booking`, `food-ordering`. `add-connector` and
`no-connector-fallback` need the agent-side tools we do not have.
