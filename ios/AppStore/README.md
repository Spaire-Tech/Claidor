# App Store screenshots

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
  (`ios/Simeon/Assets.xcassets/AppIcons`); `assets/logo-hubspot.png` and
  `assets/logo-link.png`, the marks the chat draws beside those names. They
  are the apps' trademarks, shown to say Simeon connects to them.
- `assets/airline-*.svg`: the airlines' marks as Duffel serves them
  (`assets.duffel.com`), the files the app's flight card loads.
- `assets/box-wallpaper.webp`: the cloud computer's day wallpaper
  (`box/wallpapers/simeon-a.png`).
- `fonts/`: Geist (the headlines) and Inter, both under the SIL Open Font
  License.
