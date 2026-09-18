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

## Open, for the founder

1. **Rooms: text only, or files too?** (gap 4 above.)
2. **Which kinds to add**, and whether each gets its own icon or shares the
   paperclip with a better label.
3. **Alt text**: who writes it — the agent, always, or only when the picture is
   not obvious from the prose?
