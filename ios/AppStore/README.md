# App Store listing and screenshots

Eight screenshots for the iPhone app's App Store page, at the size App Store
Connect asks for (iPhone 6.9", 1320 × 2868, flattened RGB, no transparency).
Designed on the Design canvas "Simeon App Store Screenshots"
(https://claude.ai/artifact/W8B7AWazWGxqP9i4bpNpUA, 15 October 2026);
`source/` holds the same artboards.

| File | Headline | What it shows |
|---|---|---|
| `screenshots/01-teammates.png` | AI teammates that do the actual work | The list: Simeon, Ruby and Maya pinned, the team's rows with what each one finished |
| `screenshots/02-own-computer.png` | Each teammate has its own computer | A chat with Iris, and Iris's computer: the box's own wallpaper, Chrome on a competitor's pricing page, her pointer on the price |
| `screenshots/03-chief-of-staff.png` | Your chief of staff runs the team | Simeon adds a sales lead: "Messaged Maya", then Maya named in the chat with HubSpot |
| `screenshots/04-connect-apps.png` | Connect the apps you already use | The Connectors page: Mail & Calendar, Marketing & Growth, Meetings, with ✓ and + |
| `screenshots/05-your-ok.png` | Nothing goes out without your OK | Nia's email draft card: To, Subject, the message, Send email and Discard |
| `screenshots/06-buys-for-the-team.png` | Buys what the team needs | Ruby's Checkout card: the shop's page with Review order, Visa through Link by Stripe, Total, Deny and Allow |
| `screenshots/07-work-trips.png` | Books your work trips | Kai's flight card: four morning flights to Austin with the airlines' marks |
| `screenshots/08-call-for-update.png` | Call your team for an update | A call with Ruby: the call pill in the chat with its live transcript |

The look follows the founder's references (other AI apps' App Store
pages): a light grey ground (`#F2F2F2`), a short headline in Geist, one
phone, and the teammates' faces floating at the edges, each face carrying
on into the next screenshot. The phone screens copy the app's light mode
(`ios/Simeon/Theme.swift`, `Cards.swift`, `MessageText.swift`,
`ConnectorsList.swift`): bubble colours and sizes, the agent name pill, the
email draft, Checkout and flight cards and the Connectors rows.

## Where they differ from the app

- Inter stands in for SF Pro, which can't be drawn here (on the canvas
  too, so the canvas and the PNGs match).
- Screen 5 draws the To name, "Dana Reyes", in the link blue (`#0c64c1`), as
  the founder asked; the app's draft card shows it in the text colour.
- Not yet seen working on a device (15 October 2026): a real Link purchase
  (screen 6) and a real flight search (screen 7). Apple's reviewers try what
  the screenshots show, so run both on the phone before submitting.

## Making them again

```sh
python3 ios/AppStore/render.py            # Playwright's Chromium
python3 ios/AppStore/render.py /path/to/chrome
```

It reads `source/*.dc.html`, points each canvas asset address (`/_blob/…`)
at its file in `assets/` (`assets/blobs.json`), sets the canvas's ground,
loads the fonts from `fonts/`, and photographs each page at 1320 × 2868. A
change made on the canvas comes here by copying the artboard's file into
`source/`.

## Putting them on the App Store

App Store Connect › Apps › Simeon › the iOS version being prepared ›
Previews and Screenshots › iPhone › the 6.9" display: the eight files, in
order. The app is iPhone only (`TARGETED_DEVICE_FAMILY: "1"` in
`ios/project.yml`), so there is no iPad set; Apple scales the 6.9" set
down for smaller iPhones.

## What is in it

- `assets/face-*.webp`: the teammates' faces, from the same catalogue the
  apps use (`sites/simeonlabs.com/public/faces`).
- `assets/icon-*.png`: the connector icons of the Connectors page
  (`ios/Simeon/AppIcons.xcassets/AppIcons`); `assets/logo-hubspot.png` and
  `assets/logo-link.png`, the marks the chat draws beside those names. They
  are the apps' trademarks, shown to say Simeon connects to them.
- `assets/airline-*.svg`: the airlines' marks as Duffel serves them
  (`assets.duffel.com`), the files the app's flight card loads.
- `assets/box-wallpaper.webp`: the cloud computer's day wallpaper
  (`box/wallpapers/simeon-a.png`).
- `fonts/`: Geist (the headlines) and Inter, both under the SIL Open Font
  License.

## The listing's words, in English and French

`metadata/` holds the App Store page's text for each language (20 October
2026, docs/localization.md), one file per field as fastlane's `deliver`
lays it out, so it can be pasted into App Store Connect or uploaded:

| File | App Store Connect field | Limit |
|---|---|---|
| `name.txt` | App Information › Name | 30 |
| `subtitle.txt` | App Information › Subtitle | 30 |
| `promotional_text.txt` | the version › Promotional Text | 170 |
| `description.txt` | the version › Description (it ends with the Terms and the Privacy Policy, which App Review asks of a subscription) | 4,000 |
| `keywords.txt` | the version › Keywords, commas without spaces | 100 |
| `release_notes.txt` | the version › What's New in This Version | 4,000 |
| `marketing_url.txt`, `privacy_url.txt` | Marketing URL, Privacy Policy URL | |

- `en-US/` is the English the French is translated from. The live English
  listing was not in this repository: this one is written from the website
  and the screenshots' headlines. Where the live one reads better, keep it
  and bring the French in line.
- `fr-FR/` is the French, in "tu" like the app. Simeon, Link, Shop, Face ID
  and the connectors' names are not translated. In App Store Connect: the
  language menu at the top of the app's page › French (France), then the
  fields above. French (Canada) can take the same text.
- The French name stays Simeon; the subtitle carries the French words.
- The screenshots stay English for now: the French page shows the English
  set until a French one is made (the artboards in `source/` and the app's
  screens in French).

The plans (the app › Monetization › Subscriptions › each product ›
Localization › French): the display names stay "Simeon Standard", "Simeon
Pro", "Simeon Max"; the descriptions are « 5 000 000 crédits par semaine »,
« 17 500 000 crédits par semaine » and « 60 000 000 crédits par semaine »
(a narrow no-break space between the thousands, as French writes them).
