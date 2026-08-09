# What needs designing

Everything below is a screen somebody has to look at. Ordered by when it
is needed, not by size.

Deliver plain HTML + CSS — one file per screen, static, no framework. I
convert them to React components. Inline the states as separate sections
or separate files; **a design without its states is one I cannot ship**,
because the empty case and the error case are most of what a user
actually meets.

---

## Two very different canvases

**The Office task pane is 320 pixels wide.** Word draws a strip down the
right-hand side and loads a web page into it. That is the whole canvas —
no tables, no side-by-side, no wide anything. A vertical list of cards and
nothing else fits. It is the same width in Outlook, Excel and PowerPoint.

**The web app is a normal responsive page.** On a phone the chat and the
document preview take turns filling the screen rather than sitting side by
side — Vesence's own answer, and worth copying.

---

# Priority 1 — needed now

## 1. Word task pane  *(320px)*

Built roughly and working; a real design replaces it directly.

**Screens**

| | What is on it |
|---|---|
| **Signed out** | One line, one button: sign in with Microsoft |
| **Ready** | « Check document » button, « Read for contradictions » button |
| **Working** | Checking… / Reading… — the second takes tens of seconds |
| **Findings** | Tally row, then four buckets |
| **Terms** | Filter box, count line, term cards |
| **Blocked** | This version of Word cannot record tracked changes |

**The tally row.** Four counts, always visible: Critical, Warning, To
review, Ignored. Their own panel does this and the counts must be able to
disagree with nothing.

**A finding card** carries: defect name, the term or phrase, one sentence
of explanation, the document's own words around it, and up to three
buttons — *Go to*, *Fix as tracked change*, *Ignore*. Two flags need a
visual treatment:

- **Probable** — « worth a look rather than certain »
- **Suggested** — read by a model; quotes verified, arithmetic recomputed

Those two labels are the difference between a lawyer trusting the panel
and skimming it. They need to read as a qualification, not as a warning.

**A term card** carries: the term, its meaning, a use count, what other
definitions it rests on, and two buttons — *Definition*, *First use*.

**Also needed:** a clean document ("nothing found in 84,000 characters"),
a failed check, an expired sign-in, and a finding the panel could not
locate in the document.

## 2. Web app — the minimum

Even a demo needs three screens.

**Sign in.** Microsoft only. There is no password field — their FAQ is
explicit and ours matches.

**Matters.** A list of matters with a name, a date, a file count. Create,
open, and an empty state for a new firm.

**Matter workspace.** The main screen of the product: a file list, a chat
with the agent, and a document preview. Vesence puts files left, chat
right, preview centre.

---

# Priority 2 — the month after

## 3. Chat with the agent

Not an ordinary chatbot. Vesence shows **what the agent did** as it works:

```
Used 4 tools
  Loaded    template Closing Agenda (Firm Standard)
  Read      Project_Atlas_SPA.docx
  Drafted   Closing agenda with deliverables
  Prepared  Edits — Closing_Agenda_Draft.docx
```

That trace is most of why it reads as trustworthy rather than magic.
It needs: a message, a tool-use trace (collapsed by default?), a file
attachment chip, a « + » attach menu, and a citation that jumps to a
source when clicked.

## 4. All Tracked Changes

Review proposed edits **across documents** in one place: grouped by file,
each edit showing before and after, accept and reject per edit and per
file. This is the screen that turns an add-in into a product, and it is
the hardest one on the list.

## 5. Document preview

A document with findings marked in it. Click a finding, the document
scrolls. Click a defined term, its meaning appears — Vesence's hover.

## 6. Playbooks

A list of the firm's review checklists (Buy-Side SPA, Sell-Side SPA,
Shareholders' Agreement, LMA Loan…), an editor for one, and the result
of running a document against it — each failure showing the document's
words beside the playbook's rule.

## 7. Settings

Firm details, members and roles, invitations. Mostly built already;
it needs a skin.

---

# Priority 3 — later, but on the list

## 8. Outlook task pane  *(320px)*

Mostly reuses the Word pane. What is new is the **pre-send check**, and
their own example is the spec:

```
Email Check — 5 issues
  Language & Grammar   "materialty" → "materiality"
  Recipients           Greeting says "John", recipient is "Jon Doe"
  Attachments          Body references "Closing Checklist", nothing attached
  Subject Line         No issues
  Consistency          SPA described as "v5", Next Steps says "SPA v4"
```

Categories with counts, not one flat list. Plus a thread summary —
*agreed / still open / owed by you*.

## 9. Excel task pane  *(320px)*

Three actions — Check, Format Sheet, Explain. The interesting one is a
formula explained in plain words.

## 10. PowerPoint task pane  *(320px)*

One action, Assist. Slide wording and layout notes.

## 11. Custom agents

Create and edit an agent: name, description, and a system prompt —
Vesence calls that *"the most important field"*, so it should not look
like a small text box. Plus private-or-shared, which folders it starts
from, and which surfaces it appears in.

## 12. Admin

Connectors (SharePoint, OneDrive, Teams, iManage, NetDocuments) as
connect/disconnect cards, and the model-provider choice — which routes a
firm permits. That second one is a selling point, so it should look like
a decision rather than a setting.

---

# What every screen needs

Please include, for each:

- **Empty** — no matters, no findings, no terms, no documents
- **Loading** — including a slow one that takes 30 seconds
- **Error** — the server refused, the sign-in expired, the file will not open
- **Too much** — 200 findings, 400 terms, a 186-page document

Empty and error are where most of a working product's screen time goes,
and they are the two most often missing from a design.

# Things it would help to fix once

- Colours for the four severities: Critical, Warning, To review, Ignored
- The two qualification flags: *probable*, *suggested*
- A type scale that survives 320 pixels
- Light and dark, if you want dark at all
- One icon set

# What I do with it

Hand me HTML and CSS and I convert it to React, wire it to the API, and
keep the markup faithful. That worked before — the whole Claidor dashboard
came through a design-to-code pipeline where the HTML was the source of
truth and the generated components were never hand-edited.

**Start with the Word task pane.** It is 320 pixels, it has the most
screens, and it is the only surface where anything is currently running.
