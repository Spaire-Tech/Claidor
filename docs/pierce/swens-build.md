# The Swens workspace build

The founder designed the workspace and asked for one thing: *"fix all
that isnt working or built. its all you… use your logic on everything.
be smart. think and show proof of everything you do."*

This is the record. What was broken, what it does now, and the proof
for each — plus, at the end, what is still not true.

Run it:

```bash
python docs/pierce/swens/build.py SOURCE.html OUT.html
```

---

## 0. The rule the build enforces

The design is the founder's. Every edit here wires it, fills it, or
adds a branch that was missing. None replaces anything drawn.

That is not a promise, it is a printed report. `build.py` records any
edit whose own anchor does not survive into its replacement, and
prints that list **first**, before the log, so a deletion cannot hide
in edit thirty-six:

```
REPLACED IN THE FOUNDER'S DESIGN:
  Apply the fix prepares one <- <button style="border:0; background:#1f2937; …
  Open the cell copies the reference and says which <- <button style="border:1px …
  …
  the card promises the file it hands you <- Your model back, with every problem marked in place.
```

Twenty-three lines, and twenty-two of them are the same shape: an
unbound `<button style=…>` becoming `<button sc-camel-on-click=…
style=…>`. The tag is rewritten to carry a handler; the styling,
the copy and the position are byte-identical.

**One line is a real rewrite, and it is the last one.** The card under
Findings said *"Your model back, with every problem marked in place."*
It now says *"The findings register, ready to work through. The
marked-up workbook follows when the write pass ships."* — because the
button hands over a findings CSV, not the workbook. See §2.7.

The build also measures tree depth at each project tab, because a
screen can render perfectly and still hang off the wrong parent:

```
tab nesting: all three at depth 4
```

That guard exists because an earlier build closed one container too
many and Documents painted happily *outside* the scroller, looking
right until its content grew past the window.

---

## 1. The design, as read

Read end to end before anything was touched.

- **Dock**: Ask · Project · Settings. `vCheck` and `vCompare` are
  still in the file; the dock no longer reaches them.
- **Project tabs**: Overview · Findings · Sources.
- The full report modal (three stacked pages) exists and is drawn.
- The version dropdown works.
- Nine chat exchanges are designed and all nine already live in
  `REV_ASKS`.

---

## 2. What was broken, and the proof it is not

### 2.1 The chat answered nothing outside the nine workflows

A question matching no workflow falls to `AS_ANSWERS`, becomes a
message with `role:'answer'` — and the message list had no branch for
that role. The question posted, the working line ran, and the reply
was replaced by markup that did not exist.

Every prop the answer needs was already computed. Only `hasChain` and
the markup branch were missing.

```
  ok  Check this model for me.                        → Model Review
  ok  Here's v14.                                     → Version Comparison
  ok  Can I trust the DSCR numbers?                   → Targeted Check
  ok  Show me the hardcodes in the debt schedule.     → Findings Filter
  ok  The sponsor says they only changed the tax rate.→ Version Comparison
  ok  The auditor gets this Friday.                   → Pre-Audit Sweep
  ok  Are these historicals right?                    → Filing Check
  ok  Fix this finding.                               → Determined Fix
  ok  Why didn't you check the forecast sheets?       → Coverage
  ok  How many sheets does it have?                   → (fallback answer)
  no page errors
```

### 2.2 A finding could not be ruled on

The three buttons on an open finding — Apply the fix, Not a finding,
Open the cell — had no handlers at all.

```
Apply → Fix prepared. Nothing is written to your file until you accept it.
  buttons: ["Accept it","Undo", …]
Accept → Accepted. It lands in the next version, and can be undone.
Undo   → (no ruling line) | buttons: ["Open the cell","Not a finding", …]
Dismiss → Not a finding — Carried separately in the bid schedule.
    save button before typing: rgb(201, 214, 232)   ← blocked
    save button after typing : rgb(0, 96, 208)      ← live
```

The dismissal is gated at more than two characters — the design's own
`canSaveNote` threshold, not a new rule. Open the cell copies the
reference and the label becomes `Copied 'Costs'!J61`; clipboard read
back and verified.

### 2.3 Re-check did nothing

`reCheck: () => {}`. It now runs the design's own `beginRun`. The
button reads "Checking" while it runs and the verdict chip carries
the live step instead of a stale verdict:

```
header row while running: ["Northbank Bid Model","Mapping the formula grid","Checking","Version 22"]
```

### 2.4 The dock's Project button did nothing from inside a project

`go()` cleared `deal` but not `project`, and the project view is
driven by `project`. Pressing Project while in a project left you
exactly where you were. It now lands on the project list.

### 2.5 Four buttons in Settings → Connections had no handler

Disconnect, Change, Install, Copy link.

```
1. connected : Microsoft account | e.whitmore@harbourline.com | Connected 14 July | Disconnect
2. disconnect: No account connected | No folder is watched and nothing syncs… | Connect
3. reconnect : e.whitmore@harbourline.com | Connected 14 July | Disconnect
4. install   : A web page cannot reach inside Excel, so the manifest is handed over…
5. copy link : Link copied     clipboard: file:///panel/manifest.xml
6. change    : Choose folders
```

Disconnect had nowhere to land — the card was drawn connected only —
so the other half of the card was added beside it. Change opens the
folder browser the design already contains (`openNew`). Install opens
the steps rather than pretending, because a web page cannot reach
inside Office to install an add-in; the shipped web app makes the
same choice for the same reason. Copy link copies
`/panel/manifest.xml` off this origin, the path the shipped app
serves it from.

### 2.6 Download PDF closed the report

It was bound to `closeFullRep`. It said Download and it closed the
report — worse than a stub, because it looks like it worked. It now
opens all three report pages in a print window, tagged
`[data-report="sheet"]` so they can be found, with the app's chrome
and the modal scrim excluded from the paper.

### 2.7 Download the marked-up model did nothing

`dlMarkup: () => {}`. The real thing is the workbook back with its
problem cells filled and noted, which needs the server: the write
path exists and is proven byte-identical on 27 files, but the
fill-and-note pass is not built.

So it hands over what the mock genuinely holds — the findings, off
`fnGroups`, the same array the Findings table renders, so the file
can never disagree with the list it came from.

```
suggested: "Northbank_Bid_Model_v22 findings.csv"
bytes: 1647
﻿"Severity","Finding","Where","Cell","Group","Status","Note"
"Significant","The revenue row changes formula at FY2029","Revenue","'Revenue'!R11",…
"Material","A total leaves out the row above it","Costs","'Costs'!J61",…
"Material","A cover ratio reads cash with the wrong sign","Cashflow · Covenants","'Covenants'!H14",…
```

**This is the one place the founder's copy was rewritten**, and the
reason is that the old sentence described a file the button does not
hand over. When the server pass lands, the handler points at it and
the copy loses one clause.

### 2.8 Search chats had no field

The first control in the sidebar, carrying a ⌘K chip, which is a
promise. Behind it sit nine real conversations. The row becomes a
field in place — same height, same magnifier, same padding, so the
sidebar does not jump.

```
  chats listed: 9
  field: present, focused
  "hardcode" -> Hardcodes in the debt schedule
  "v21"      -> Hardcodes in the debt schedule / v20 vs v21 differences / What could not be checked
  "zzz"      -> (none)
      says: No chats match "zzz" | Only this project's chats are being
            searched. Switch to All to look across every project.
  after Escape: 9 chats back
```

The scope switch the founder drew above the list keeps applying, so a
search inside "This project" searches this project — and when that
finds nothing, the empty state says which shelf it looked on rather
than implying the chat does not exist. A dated group already hid
itself when a search emptied it (`.filter(g => g.items.length)`);
Pinned did not, because until now it could not be emptied. It does.

The chip says ⌘K, so ⌘K works — bound on the document, not the field,
since the point of the shortcut is reaching a field that is not on
screen yet. It opens the rail first if the rail is shut, and does
nothing outside Ask:

```
start:            rail shut, field absent
after ⌘K:         rail open,  field focused
in Settings:      field absent
```

### 2.9 Share had no handler

Sharing a conversation is a link, and a link is the one part of it a
mock can genuinely hand over.

```
  acknowledgement shown: true
  clipboard: file://…/swens-v2.html#chat=new
  clears itself: true
```

The icon carries no label, so the acknowledgement sits beside it.

### 2.10 The files an answer offers did not open

Nine of the ten exchanges end in one or two file cards. All drawn as
buttons; none carried a handler. Which file it is decides what
opening means, and for two of three kinds the founder already
decided:

- the **Word** card is the written report — *"a report of the
  summary, the written version of what's going on"* — and that
  report is drawn, three pages of it. So it opens.
- the **register** is the technical one — *"the excel is the
  technical report, with all the findings"* — so it downloads, from
  the same generator as §2.7, under the name on the card.

```
— Show me the hardcodes in the debt schedule.
  cards: ["Northbank hardcode register"]
    → Northbank hardcode register.csv (1647 bytes, 14 findings)

— Check this model for me.
  cards: ["Northbank Bid Model — proposed v23","Northbank Model Review Memo"]
    Northbank Bid Model — proposed v23 → a sheet naming the file
    Northbank Model Review Memo        → the written report, 3 pages
```

**The third kind is why this took two passes, and it is worth
recording as a mistake.** The first build handed *every* Excel card
the findings CSV. "Northbank Bid Model — proposed v23" is the
workbook with the fixes in it; "v13 → v14 change log" is a diff of two
files; "DSCR trace" is an evidence chain. All three downloaded
cleanly under a name that was not what was inside them — the exact
failure Download PDF had before this build touched it. They now open
a sheet naming the file and saying what produces it.

The card's kind is not recoverable at render time: `IC()` resolves
`icons/excel.webp` to an opaque asset id and the path is gone by the
time the mapper sees it. So the kind is stamped where the path still
exists, beside the icon, without disturbing it.

### 2.11 "Open the 4 material ones" opened an empty drop zone

Every answer ends with a named action — Open the 4 material ones,
Open the changed cells, Review 3 corrections — and all of them were
bound to `openFindings`, which set `view: 'check'`: the private
bench, the drag-a-model-here screen the founder took off the dock. So
the most specific promise on the screen led nowhere.

```
primary action: Open the 4 material ones
view after: Northbank | Overview | Findings | Sources | All 14 |
            Material 5 | Significant 5 | Observation 4 | … |
            The revenue row changes formula at FY2029 | Revenue | Significant | …
```

Both halves existed — `pjProjects[].open` sets `project`, `goFindings`
sets the tab — and nothing joined them up. Which project comes from
the answer's own file name, because in a mock that is the only place
the subject is written down.

---

## 3. What is still not true

Stated plainly, because the alternative is the founder finding out by
clicking.

1. **Nothing is connected to a server.** No file is read, no check
   runs, no answer is generated. Every number on screen is the
   founder's placeholder data. The chat matches a question against
   ten scripted exchanges and replays one.

2. **The marked-up workbook does not exist.** §2.7 hands over a
   findings register instead. The write path is real and proven
   byte-identical on 27 files; the fill-and-note pass is not built.

3. **Fourteen buttons are still unbound**, all inside `hasDeal`,
   `vCheck` and `vOther` — none of which any path reaches:
   - `open` and `clean` are the only things that set `s.deal`, and
     neither is rendered anywhere (`{{ open }}` and `{{ clean }}`:
     zero markup references), so `hasDeal` is never true;
   - `view: 'check'` is now set nowhere in the file — §2.11 removed
     the last one — so `vCheck` is off the dock and off every path,
     which is what cutting it was for;
   - `vOther` is `view` being none of the six known views, and the
     dock only ever sets three of them.

   They are left alone deliberately. Wiring a screen the founder
   removed would be building past the design.

   **This claim was wrong the first time it was made.** Earlier in
   the build I reported that the remaining unbound buttons were all
   in unreachable views. `openFindings` reached `vCheck` from every
   answer, so they were not. §2.11 is what makes the sentence true;
   it did not read that way when it was first written, and the only
   reason it changed is that the claim got checked instead of
   repeated.

4. **`toggleChkRail` is still an empty stub**, on the same
   unreachable bench.

5. **`verAll` is dead code**, pointing at a Versions tab the founder
   removed. Reported, not touched — deleting something they drew is
   their call, not mine.

6. **Two engine refusal messages leak Python exception names**
   (`BadZipFile`, `KeyError`) from `ingest.py`. Unrelated to this
   file; still open.

7. **The nine chat-history rows do not open their chat.** Their
   handler is the founder's own — `open: () => this.setState({
   histOpen: false })` — which closes the rail and nothing else. So
   the pinned chats and the seven under Today / Previous 7 days are
   listed, are searchable, and lead nowhere.

   Not fixed, deliberately. The mock stores no conversation content,
   so opening one means deciding what a restored conversation shows —
   a design question, not a wiring one. Flagged rather than invented.

8. **Placeholder arithmetic does not reconcile.** "Open the 4
   material ones" lands on a Findings tab showing five Material. Per
   the standing arrangement, mock numbers that do not add up are not
   defects and were not touched.

---

## 4. The files

| file | what it is |
|---|---|
| `swens/build.py` | extract the bundled template, apply named edits, verify nesting, re-embed |
| `swens/edits.py` | eleven edits, each named for what it fixes and documented with why it exists (48 individual swaps) |
| `swens/screens.py` | markup added to the design, in the design's own tokens |

### The click audit, in full

The last check clicks every visible button on every reachable screen,
reloading the page between clicks so nothing leaks:

```
clicked 108 buttons across 8 screens
DID NOTHING (34)
no page errors
```

Thirty-four is not thirty-four defects. Every one was run down:

- **Twelve are a tab navigating to itself** — Settings while in
  Settings, Overview while on Overview. Correct behaviour.
- **Ten are the House rules toggles, and they work.** The audit
  compares `document.body.innerHTML.length` and `innerText`; a toggle
  whose whole effect is repainting one chip moves neither. Measured
  directly, every pair flips:
  `rgb(255,255,255) / rgb(28,31,35) / lifted` ⇄
  `rgba(0,0,0,0) / rgb(143,150,160) / flat`.
- **Three are the already-selected half of a two-way control** —
  "This project" on the chat scope, "All 14" on the severity filter,
  "Map" on Sources. The audit does not flag their opposite halves,
  which is the proof they switch. Verified anyway:
  `Map (default) → after Documents → back to Map`, all three
  distinct.
- **"Send" was clicked on an empty composer.** With a question typed
  it sends: *Can I trust the DSCR numbers?* → Targeted Check.
- **"New chat" was clicked on an empty chat.** `asNew` clears
  `asMsgs`; there was nothing to clear.
- **Nine are the chat-history rows, and this one is real.** See §3.8.

Two encoding rules the build cannot forget:

Two encoding rules the build cannot forget:

- a literal `</script>` inside the template JSON closes the tag the
  JSON lives in and truncates the page, so every `<` + `/` pair
  is escaped to a `\u002F`, the way the original encoder does it;
- markup drawn identically in several places (the finding action
  cluster appears three times, the report sheet three) needs
  `swap_after` or an explicit `times=`, or the wrong copy changes.
