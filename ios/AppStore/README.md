# App Store screenshots

Six screenshots for the iPhone app's App Store page, at the size App Store
Connect asks for first (iPhone 6.9", 1320 × 2868, flattened RGB). Designed
on the Design canvas "Simeon App Store screenshots"
(https://claude.ai/artifact/G2FnKr4iE77ko23P4b7vWC); `source/` holds the
same artboards.

| File | Headline | What it shows |
|---|---|---|
| `screenshots/01-team.png` | Your team of agents, always on | The list: pinned agents, rows with titles, Theo's row lifted out while he works |
| `screenshots/02-message.png` | Message them like a teammate | A chat with Theo; the email he sent, lifted out |
| `screenshots/03-computer.png` | Each agent has its own computer | Theo's live screen moving a deal, with Take over |
| `screenshots/04-apps.png` | Connect the apps you already use | App tiles: Slack, Gmail, Calendar, Notion, Drive, HubSpot, Figma, Linear, Salesforce, Stripe |
| `screenshots/05-call.png` | Prefer to talk? Just call | A call with Nora and its transcript |
| `screenshots/06-approve.png` | Nothing goes out without your OK | The approval card: Allow once, Always allow, Deny |

The look follows the founder's reference (11 October 2026: "i like claudes
style"): a serif headline in warm white over a dark, grainy ground, the
app's screen below it, and one part of it lifted out at a larger size. The
grounds are the agents' own butterflies, blown up and out of focus in each
agent's colours; the computer's is the founder's photograph (the cloud
computer's wallpaper). The phone screens use the app's light-mode colours
and sizes (`ios/Simeon/Theme.swift`, the list row and chat bubble metrics).

## Making them again

```sh
python3 ios/AppStore/render.py            # Playwright's Chromium
python3 ios/AppStore/render.py /path/to/chrome
```

It reads `source/*.dc.html`, points each canvas asset address (`/_blob/…`)
at its file in `assets/` (`assets/blobs.json`), loads the fonts from
`fonts/`, and photographs each page at 1320 × 2868. A change made on the
canvas comes here by copying the artboard's file into `source/`.

## What is in it

- `assets/butterfly-*.svg`: the agents' butterfly in each of the twelve
  palettes, made from `AGENT_MARK_SVG` (`desktop/source/shared/voice-call/agent-mark.ts`)
  with its colours worked out.
- `assets/logo-*`: the connector logos the app and the website already
  carry (`ios/Simeon/Assets.xcassets/Connectors`, `sites/simeonlabs.com/public/logos`).
  They are the apps' trademarks, shown to say Simeon connects to them.
- `assets/wallpaper.jpg`: the founder's photograph.
- `fonts/`: Newsreader (the website's serif) and Inter, both under the SIL
  Open Font License. Inter stands in for SF Pro, which can't be rendered
  here, on the canvas too, so the canvas and the PNGs match.
