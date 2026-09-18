# Artifacts: ours against Grok Bot's

18 September 2026. Source: `sources/grok-bot-artifacts.md`, saved verbatim.
Everything about our side was traced in the tree, not recalled.

---

## The headline: it confirms the decision we made this morning

Grok Bot has **no `SendToUser` type called `artifact`**. Its product
"artifacts" are attachments plus inline images, classified by kind. There is no
rendered document living inside the conversation.

That is independent confirmation of the OpenUI removal
(`artifacts-decision.md`). We reached it from the founder's complaint that the
file they could send on had stopped being made; Grok Bot reached it by never
building the other thing. Two routes, same answer.

Its §0 is worth quoting as a warning we have already heeded:

> **do not bake "artifacts open as an iframe" into Caisra design**… Bake:
> **attachment message → kind classification → kind-specific preview or
> download affordance**.

## The two models, side by side

| | Grok Bot | Caisra |
|---|---|---|
| How a file is delivered | `SendToUser` with `type: "attachment"`, or `text` + `images[]` | A markdown link on the last lines of the reply |
| What turns it into a card | The host classifies extension/MIME | `peelAttachments()` takes trailing link-only lines |
| Kinds | **11** — image, video, audio, pdf, markdown, table, json, text, document, archive, file | **4** — pdf, docx, xlsx (csv too), pptx — plus image, plus a paperclip fallback |
| Image with prose | `images[]` on the **text** message, same bubble, under the words | **No such path** |
| Standalone image | `attachment`, optional `alt` | attachment card, picture shown |
| Alt text | on hover and in the fullscreen viewer | none |
| Preview | kind-specific; pdf.js in-stack; document/table chrome **unknown** | the artifact right panel, **always** |
| Rooms | attachments **banned**; text only | undecided — a room merges each member's items as they are |
| Size limits | only cloud-sync limits documented | none |

## Three places ours is better, and worth keeping

**1. Delivery by link cannot be forgotten.** Grok Bot's agent has to *call a
tool* to deliver a file, which is why its own contract has to say
*"attachments are user-visible only via SendToUser"*, *"plain model text never
delivers a file"* and *"ack ≠ delivery"*. Those are three rules guarding one
failure: the agent says it sent the report and no file arrives. Ours writes a
markdown link in the reply it was already writing, and `peelAttachments` does the
rest — that failure class does not exist for us. Do not adopt their shape.

**2. Preview is decided, and theirs is not.** Their gap list opens with *"Confirm
document and table preview implementation (iframe / webview / native /
download-only)"* — unknown, to be settled with client engineering. Ours was
settled by the founder: *"when the ai write an artifact… and the user clicks on
it, the ai must always open it in the artifact right panel. Always."*
`openFile.ts` implements it in three cases — show, load, system — and only falls
back to the operating system for a file the agent did not make.

**3. `.csv` counts as a spreadsheet.** We map csv/xls/xlsx to one Excel kind;
they map csv/tsv/xls/xlsx to one `table` kind labelled "spreadsheet". Same
judgement, reached separately. Keep it.

## Five places ours needs changing, in order

**1. An image that belongs with the words does not render — it renders as a
paperclip.** This is the real find.

`peelAttachments` only takes link-only lines from the **end** of a reply. A
picture named inside a sentence — *"here's the chart [chart.png](/…) — revenue
is flat"* — never becomes an attachment at all: `parts.ts` turns it into a
`File` **chip**, so the person gets a paperclip where the picture should be.
Grok Bot's rule is explicit and is the right one:

> If image(s) **belong WITH** what you're saying → put them on the **text**
> message via `images[]` (same bubble, below text). Use `type: "attachment"` for
> an image **only when the image IS the whole message**.

And: *"**Never** embed images as markdown `![](...)` in content."* We have no
rule about `![]()` at all, so an agent that writes one gets whatever `parts.ts`
does with it — worth checking and then forbidding.

This matters more now than it did yesterday. Images were unreachable until this
morning (`images-state.md`), so nobody has ever seen the failure. The moment the
image route works, every illustrated answer hits it.

**2. Four kinds is too few for what the agent now makes.** With the document
skills switched on, an agent can produce a `.zip` of deliverables, a `.md`, a
`.json`, a `.txt`, an `.mp4`. Every one of them is a paperclip today. Grok's
eleven is a reasonable target; the cheap and worthwhile additions are
**archive**, **markdown**, **text/json**, and **video/audio**, each of which
changes an icon and a verb rather than a mechanism.

**3. No `alt`.** Theirs carries a short description shown on hover and in the
fullscreen viewer. Ours has no field for it. That is an accessibility gap and a
hover affordance, and `AttachmentItem` has nowhere to put one.

**4. Rooms are undecided.** Grok bans attachments in a room outright — a room
turn is text only, and a file goes as a DM. Our `mergeRoomThread` carries each
member's items through as they are, so a file card would appear in a room today.
That is a product decision the founder has not been asked: is a room text-only,
or does a file land there?

**5. Nothing knows about size.** `AttachmentItem.size` exists and is optional;
nothing sets a limit or degrades. Theirs documents 20 MiB per synced cloud
artifact and 12 of them. Ours needs *a* number, particularly once files cross to
a box.

## What I would not copy

- **Their cloud-agent artifact sync** (§5) — `/opt/cursor/artifacts`, hosted
  URLs, a 12-file cap. It exists because Cursor cloud agents write to a VM whose
  paths render blank in chat. We have no cloud agents. It becomes relevant only
  if the box writes somewhere the app cannot read, which is a question for the
  box, not for artifacts.
- **`voice_memo: true` as a flag on text** (§8) rather than an audio
  attachment. Reasonable for them; we have no voice memo and should not invent
  the flag before the feature.

## Decided, 18 September — three briefs an agent can pick up

The founder took the recommendation on all three. Each is written here as a
brief rather than built, because the implementation is being staffed.

### A. Files are allowed in rooms

**Decided: keep files in rooms.** Grok Bot bans attachments in a group turn and
DMs the file instead; that reads as a limit of their transport — their room turns
degrade cards generally — not a principle. In our app a room is merged threads
and a file card draws correctly in one. Banning it would mean "the Finance agent
made your report, now go and find it in another conversation".

**The work is to make this deliberate rather than accidental.** It is already
what `mergeRoomThread` does, by not filtering. So:

- a test that a room thread carries an attachment from a member, named so its
  purpose is obvious (`a file a member made appears in the room`);
- one line in the brief's room section, so the agent knows it may attach in a
  room and need not DM the file;
- nothing else. No code change is expected — if one is needed, the behaviour was
  not what this audit found and that should be reported before "fixing" it.

### B. Three new file kinds: archive, video, audio

**Decided: add archive, video and audio.** Those are the three where the icon
says something the filename does not. `.md`, `.json` and `.txt` fold into **one**
`Text` kind with a better label rather than three more icons.

`FileKind` today is `Pdf | Word | Excel | Slides`
(`renderer/design/thread/types.ts`), mapped from the extension by `fileKindOf()`
in `thread/attachment.ts`. The change is that function, the enum, and the icon
each draws.

**Blocked on artwork, and this is the founder's.** The current set is brand
logos — `word.webp`, `excel.webp`, `powerpoint.webp` in `design/logos/` — plus
`pdf-doc.webp` beside the card. There is **no** archive, video, audio or generic
text artwork anywhere in the tree, and `icons.tsx` is UI chrome (search, home,
gear), not file types. So this brief needs four drawings before it can finish:
archive, video, audio, text. Until they exist, the kinds can be added and will
fall back to the paperclip, which is still an improvement on nothing because the
label improves.

Extensions to map, from the Grok source: archive — `.zip .tar .gz .tgz .rar .7z`;
video — `.mp4 .mov .m4v .webm .ogv`; audio — `.mp3 .m4a .wav .aac .flac .ogg
.opus`; text — `.md .markdown .mdx .json .txt .log .csv`… **except** `.csv`,
which stays Excel: both stacks decided a spreadsheet is a spreadsheet.

### C. Alt text: always written, never shown on hover

**Decided: the agent writes an `alt` for every image, and the app does not show
it on hover.** The two halves are one decision. "Always" is the only setting that
works for somebody using a screen reader, and not showing it on hover is what
makes "always" costless — a description that repeats the sentence above it is
noise if everyone sees it, and harmless if only a screen reader does.

The work:

- `alt?: string` on `AttachmentItem` (`thread/types.ts`) — today there is
  nowhere to put one;
- the renderer puts it on the image's accessible name and in the fullscreen
  view, and **not** in a `title` attribute, which is what would make it a hover
  tooltip;
- a line in the brief telling the agent to write one, in the same place the
  document rules live;
- a test that an image attachment without an `alt` is still drawn — a missing
  description degrades, it does not break the card.

### Still open

- **Gap 1 above — an image inside a sentence renders as a paperclip.** That is a
  defect rather than a decision and is the first thing to fix once images work.
- **Gap 5 — size.** Nothing knows about file size yet, and it wants a number
  before files cross to a box.
