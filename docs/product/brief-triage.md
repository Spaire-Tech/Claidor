# The brief, triaged against the record

18 September 2026. The test applied here is one rule:

> **A rule keeps its place only if it can name the incident in
> `docs/product/review.md` that produced it.** There are 81 numbered
> items. A rule that cannot cite one is somebody's theory, and the
> theories are what have been wrong.

This is the list. **Nothing has been deleted.** Every verdict below is a
proposal, and the founder's decision comes first.

---

## How this was produced, and what it is worth

Every section of managed prose was read, and `review.md` was searched for
the vocabulary that section is about. Where a section's own docblock
already names its provenance, that claim was checked against `review.md`
rather than believed.

**What was searched, in `docs/product/review.md`:** `HEARTBEAT`,
`HEARTBEAT.md`, `KaTeX`, `TeX`, `formula`, `MEMORY.md`, `memory file`,
`web_search`, `Brave`, `web search`, `shared file`, `project memory`,
`PROJECT_MEMORY`, `injection`, `external content`, `data, not
instructions`, `webhook`, `event trigger`, `woken by`,
`propose_connector`, `connector card`, `details block`, `disclosure`,
`` ```details ``, `fenced`, `collapse`, `sessions_send`, `group room`,
`Telegram`, `DingTalk`, `Feishu`, `ReactToMessage`, `reaction`,
`AskUserQuestion`, `question card`, `ASK_INPUT`, `masked`, `password`,
`caisra://settings`, `app-ui`, `exploit`, `malware`, `web_fetch`,
`sandbox`, `your computer`, `my computer`, `Not now`, `dismiss`,
`expire`, `routine`, `cron`, `scheduled`, `propose_team`,
`twenty-three`, `SKILLs`, `skill store`, `file card`, `links.ts`,
`absolute path`, `picture`, `image`, `og:image`.

The introducing commit for each `MANAGED_*` constant was also read
(`git log -S`), which separates what this build wrote from what the
vendored fork shipped.

Two traps caught me while doing it, and both are recorded because a
"zero hits" claim is only as good as the search behind it. A
case-insensitive search for `TeX` matches inside the word *text*, so the
first pass appeared to find maths references that were not there; the
counts in C2 are from a case-sensitive `KaTeX` and a word-bounded
`\bTeX\b`, both zero. And a `grep -E` pattern written with `\|`
matches a literal pipe rather than alternating, so an early sweep
returned nothing for half a dozen topics that do appear. Both sweeps
were redone.

**What was not done, and it matters.** No rule below has been measured
against a live model. This is a reading of the brief against the record,
which is the same method that produced the four contradictions
`brief-audit.md` found — it is better than nothing and it is not a
measurement. The Rakazo eval harness (`CLAUDE.md`, "Their eval harness")
is the thing that would settle these, and it has not been built.

---

## The three verdicts

The test as written has two outcomes. Reading the brief against the
record produced three, because a large amount of it cites something real
that is **not** an incident:

- **A — cites an incident.** A numbered item in `review.md` where the
  founder, or a run, produced the fault this rule exists to stop.
- **B — cites a decision or a source document.** `direction.md`, the
  founder's `sources/caisra-permissions.md`, the Grok Bot references in
  `docs/product/sources/`, or a founder instruction recorded in an item
  that is a *build*, not a fault. Not a theory. Not an incident either.
- **C — cites nothing.** Inherited from the vendored fork and never
  audited, or written forward from reasoning. **These are the theories.**

Totals, counted per heading (not per file, so a section that is A in one
half and B in another is split), over the 46,397 characters of managed
prose the agent reads:

| Verdict | Headings | Characters | Share |
|---|---|---|---|
| A — cites an incident | 39 | 33,003 | 71% |
| B — cites a decision or source | 12 | 9,160 | 20% |
| C — cites nothing | 4 | 4,234 | 9% |

Every heading is assigned; nothing is unclassified. The `docs/product/`
prose, the upstream half above the marker, and `VOICE_BRIEF` are not in
this count — see the two findings at the end for the last of those.

---

## A — cites an incident. These stay.

| Section | Chars | Item | What the item is |
|---|---|---|---|
| `## What you are` (`identity.ts`) | 1,723 | **65** | *"i have a serious serious bone to pick"* — the agent read the app's own code and told the person what it was forked from. The section quotes the incident inside itself, 16 September. |
| `## Talking to the Person` (`conversation.ts`) | 9,337 | **26**, 63, 67 | Item 26 is the section's origin: seven managed sections existed and *"every one of them is a rule about a tool. Not one was about the conversation."* Item 63 (*"the ai is dumb"*) and 67 (*"there are garbages"*) are the faults it was tightened against. |
| — `### Answer before you work` | 1,251 | **46**, 26 | Item 46 is the DoorDash afternoon: *"It stopped after every promise… a reply with no tool call ends the turn, so each time the model wrote the line alone the work died until the person typed."* The rule's "the one line and the first tool call go in the same response, always" is quoted in the item. |
| — `### Say something when something happens` | 851 | 26, 63 | Item 63 opens with a tool's raw `{ "ok": true }` in a bubble. The rule "never paste a tool's output as your answer" is that fault. |
| — `### And nothing when nothing has` | 272 | 26 | *"a scheduled job told to stay quiet ends with no message, not 'no change'"* — item 26. |
| — `### Words that never reach them` | 725 | 26, 65 | Item 26 fixes "your computer, never the sandbox"; item 65 fixes the internal names. |
| — `### When you are one of several` | 1,228 | **81**, 70 | Item 81 is the agent-to-agent build and the correction owed on it; item 70 is the audit that sat unactioned for two days. `sessions_send` is named in both. |
| `## Browser Policy` (`browser.ts`) | 2,674 | **22**, **46** | The browser opened a separate browser, and the agent told the founder *"I can't access a sandboxed built-in browser in this workspace"* — quoted at `review.md:687`. The `target`/`profile` split exists because of that sentence. `### Reading a page that redraws` is item 46 faults 2 and 3: the click that "landed" and nothing loaded, and the snapshot that dropped 2,000 nodes silently. |
| `## What You Can Look Up About This App` (`appUi.ts`) | 1,778 | **26**, 24 | Item 26 built `reference/app-ui.md` because *"there was no map"*; item 24 is every "check the log" pointing at a directory that does not exist. |
| `### User Choices & Decisions` (`execSafety.ts`) | 3,693 | **19**, 63, 75 | Item 19 — the founder's designed questions are not there. Item 63 — the question card *"was forbidden by its own description"* and failed twice with a schema error. Item 75 — the question card redrawn. |
| `### Their computer asks once` | 792 | **35**, 67, 68 | Item 67 quotes the founder's own permissions document: *"a permission md from grok bot we MUST follow… once per machine until revoked"*, against a thread showing five repeated grant lines. |
| `### Running a command` | 695 | **18**, 67, 68 | Item 18, the app never asks to run anything; item 68, the auto-review reviewer. |
| `### When you are told no` | 840 | 67, 68 | Item 68 defines what a refusal is and what a flagged command means. |
| `### Acting as them` (`execSafety.ts`) | 792 | **46** | Item 46 fault 4: *"It asked four times after being told to go."* The rule that "order it", "yes" and "k" are the answer, that a review step nobody asked for is not to be invented, and that a question card can be drawn here, are that fault's three fixes, named in the item. |
| `## Files You Made` (`documents.ts`) | 1,230 | **37**, 63, 78 | Item 37 is the founder's *"You didn't fix the Word file."* Item 63 is a Word document they could not open with no file card. Item 78 is the skills that hijacked a report. The docblock's "Rewritten 18 September" is the record of that. |
| `## Who you are` + the chief-of-staff rules | 2,703 | **55**, 59, 62 | Item 55 (onboarding step one: Yodo), 59 (Yodo can stand up an agent), 62 (the roster card and `propose_team`). |
| `### The person` (`person.ts`) | 168 | **55** | The work type collected in onboarding step one. |
| `## Artifacts` (`artifactsPrompt.ts`) | 3,067 | **21**, 72, 80 | Item 21, artifacts do not render; 72, the deck and report whole; 80, the truth about pictures. |
| The answer cards (`cardsPrompt.ts`) | 4,651 | **71**, 73, 80 | Three items, all builds against the founder's design and a live fault. |

---

## B — cites a decision or a source document, not an incident

These are not theories, and they are not mine. Each one traces to
something the founder wrote or chose. They are listed because the test as
stated would fail them, and that is worth knowing before anyone applies
the test mechanically.

| Section | Chars | Cites | Note |
|---|---|---|---|
| `### Two hard lines` (`execSafety.ts`) | 677 | Grok Bot's contract §2.3, §15.2, via the founder's decision of 15 September | Recorded in the code comment, not in `review.md`. No incident: nobody ever asked a Caisra agent for an exploit. `exploit` and `malware` return **zero hits** in `review.md`. |
| `### Passwords, Keys And Codes` | 1,522 | The ask-input MCP server, built | The tool is real and shipped (`askInputMcpServer.ts`) and `review.md` names it in passing — item 44's renaming sweep, and item 59 building `create_agent` "the same shape as the ask-input tool". But **no numbered item records a password being asked for in chat**, which is the fault these eight rules exist to stop. The one `masked` hit (`review.md:947`) is a Settings key field, not this card. |
| `### Putting the bulk out of the way` | 823 | `grok-bot-chat.md` §11.4 | Built and tested (`renderer/design/thread/details.ts`, with its own tests). `` ```details `` returns **zero hits** in `review.md`. The feature is real; the *incident* does not exist. |
| `## Where To Look First` + `## Waiting For Something To Happen` (`escalation.ts`) | 2,421 | `grok-bot-chat.md` §5.3, `grok-bot-agent-reference.md` §9; item 70 for the webhook's limits | The escalation order is a source document's. The "you cannot reach the open internet with this" line **is** item 70, verbatim, and is the strongest rule in the section. |
| `### Two things worth offering` | 528 | Items 70 and 76/77 | The routine offer answers item 70's *"a person can only get a routine by asking an agent for one in words"*. `propose_connector` is item 77's card. Borderline A; listed here because neither item reports an agent failing to offer. |
| `### Work it out yourself where you can` | 767 | `brief-audit.md` §1 | What survived the ask/assume split. The audit is a document, not an incident; the incident behind the *split* (item 63's question card) belongs to `### User Choices & Decisions`, which owns the axis. |

**Two of these are facts about a shipped feature, not rules about
behaviour.** They state where a file is and what must not go in it, so
there is nothing in them for another section to contradict. They should
be kept whatever is decided about the rest:

| Section | Chars | Note |
|---|---|---|
| `## Skill Creation` (`skills.ts`) | 226 | A directory path. |
| `## The Work You Share` (`projects.ts`) | 1,227 | The shared project file. Its only `review.md` appearance is in passing (`review.md:1459`, inside item 36), so its citation is the thinnest in B — but the feature is real (`shared/projects/constants.ts`) and the section only renders for an agent that has projects, so it costs nothing to an agent that does not. |

---

## C — cites nothing. These are the theories.

Four sections, 4,234 characters, 9% of the brief. All four arrived in commit `81b3d292`,
the vendored fork's own history — they are NetEase's text, not this
build's, and `review.md` item 26 names them as pre-existing without ever
recording a fault that produced them.

### C1. `## Heartbeat Policy` — 709 chars

**Searched:** `HEARTBEAT`, `HEARTBEAT.md`. `HEARTBEAT.md` appears
**nowhere** in `review.md`. The only `heartbeat` hits are transcript tags
(item 44) and an engine config list — neither is an incident.

Five rules telling the agent to keep `HEARTBEAT.md` empty. The app
already enforces this in code: `openclawHeartbeatRepair.ts` has
`repairHeartbeatFile` and `stripProactiveHeartbeatSection`, both imported
by the config sync. **A rule that duplicates a code guarantee is the
weakest kind of rule in a brief that gets cut at a character limit.**

It also opens with *"This policy supersedes any earlier heartbeat
guidance in this file"* — a rule claiming to override other rules, which
is exactly the shape `brief-audit.md` §4 and the audit of `### Running a
command` both flagged as not a thing any rule gets to say.

**Proposal: delete.** The code already does it.

### C2. `## Math Formula Formatting` — 689 chars

**Searched:** `KaTeX`, `TeX`, `formula`. **Zero hits** in `review.md`.

Nobody has ever reported a formatting fault with a formula in this
product. Four rules about `$...$` delimiters for a legal-research
adjacent desktop assistant.

**Proposal: delete**, and if a maths fault ever appears, write it then
against the real thing.

### C3. `## Web Search` — 1,284 chars

**Searched:** `web_search`, `Brave`, `web search`. The only hit is
`review.md:1019` — item 26 listing it as one of the seven inherited
sections. `Brave`: zero hits.

Six rules, three of which are about which tool to prefer, and which
**restate the escalation order** that `## Where To Look First` owns:
`web_fetch` for a page you can name, `browser` for anything you need to
search. That is the same decision stated in two sections, 1,200
characters apart — the precise pattern `briefConsistency.test.ts` exists
to catch, and it does not catch it because "where to look for a fact" is
not one of the axes the test names.

**Proposal: cut to the two rules that are facts and not preferences** —
`web_search` is disabled in this workspace, and do not claim you searched
unless you did — and point the rest at `## Where To Look First`.
**This is the one item in C where I recommend adding an axis to
`briefConsistency.test.ts` rather than only deleting**, because the axis
is what stops it coming back.

### C4. `## Memory Policy` — 1,552 chars

**Searched:** `MEMORY.md`, `memory file`. Hits at `review.md:1394-1419`
are inside item 35 and are about **where** `MEMORY.md` lives during a
workspace migration — not about an agent saying it remembered something
and not writing it.

Ten rules. The first block ("write before you confirm") is inherited and
cites nothing. The last paragraph — "When two memories disagree", on
whose `MEMORY.md` wins — is **not** inherited: it was written for the
shared-project feature and it is the only part with a job.

**Proposal: keep the precedence paragraph, delete the rest**, unless
somebody can name the run where an agent claimed to remember and did not.

---

## Two findings the triage turned up that are not deletions

### The brief has a fourth author, and no test reads it

`VOICE_BRIEF` (`shared/agent/voiceBrief.ts`) is ~800 characters of the
founder's own wording, written into every hand-made agent's instructions
and every role agent's. It is **not** in `managedBriefSectionsForTest`,
so `briefConsistency.test.ts` has never read it. It contains:

- *"Prefer prose; use bullets only when the content needs them."*
- *"Ask at most one real question at a time; otherwise decide and
  proceed."*

Those are the **card/prose** axis and the **ask/assume** axis — the two
axes `brief-audit.md` §1 and §2 identified as the contradictions that
cost the founder live faults, decided a second time, in a file no test
covers.

This is the same failure as `brief-audit.md` §0 (the upstream half
nobody read), one layer down. **It is not mine to change**:
`direction.md` §4 says this is the founder's wording and is not to be
paraphrased. It is the founder's call, and they should be told it is
there.

### The web-search contradiction is live, and the test cannot see it

I first wrote here that `## Where To Look First` and `## Web Search` were
outside the test. **That is wrong, and the correction is the more useful
finding.** Both *are* in `managedBriefSectionsForTest`. The test reads
them and passes anyway.

It passes because `briefConsistency.test.ts` checks three axes and only
three: whether to ask or assume (owned by `### User Choices &
Decisions`), whether an answer is a card or prose (owned by `## Cards`),
and whether to do more than was asked (owned by `## Artifacts`). There is
no axis for **where to look for a fact**, so both sections are free to
decide it, and they do:

- `## Where To Look First` — a numbered order: what you have, a connected
  service, the web, the signed-in browser, their computer, them.
- `## Web Search` — *"If you already have a specific URL, use
  `web_fetch`… If you need search discovery… use the built-in `browser`."*

The same decision, in two sections, 1,200 characters apart. This is the
exact shape of `brief-audit.md` §1–§3, still in the brief, today. Being
inside the test's input is not the same as being checked.

**What is genuinely outside the test's input**, for completeness: the app
map (`appUi.ts`), math format, heartbeat, projects, the person line,
skill creation, `CHIEF_OF_STAFF_BRIEF`, `VOICE_BRIEF`, and the
scheduled-task prompt. Eight of the fourteen managed prompt units are in;
six are not, plus the cards and artifacts prompts that the test adds
itself.

**Proposal, in priority order:**

1. **Add a `where-to-look-for-a-fact` axis** owned by `## Where To Look
   First`. This is the piece that stops C3 coming back, and it matters
   more than deleting C3.
2. Add the six missing units to `managedBriefSectionsForTest`, so a rule
   added to the app map or the projects section cannot restate an axis
   unseen.
3. Decide what to do about `VOICE_BRIEF`, which no test can read today
   because it is not a managed section at all.

All three are changes to `briefConsistency.test.ts` and to the section
list, so none of them is in the extraction PR and none is done here.

---

## What deleting all of C buys, and whether it is worth it

4,234 characters of 46,397, about 9%.

It is worth saying plainly what that is and is not. **It is not a fix for
the character limit.** Item 63 established that the engine cut every
instruction file at 20,000 characters and the managed file was 38,000;
the config sync now sets `bootstrapMaxChars` to 120,000 and a runtime
test holds the file under it. The brief is not near a cliff, so deleting
C is not urgent on those grounds.

What it buys is the thing `brief-audit.md` said actually matters: four
fewer sections that can contradict a section with a real incident behind
it, and four fewer places where a rule sits earlier in the file than the
right one. C3 is the clearest case — it is *already* contradicting
`## Where To Look First`, today.

**Recommendation, in order of confidence:**

1. **C2 (math) and C1 (heartbeat) — delete.** Zero hits each, and C1 is
   duplicated by code that already runs.
2. **C3 (web search) — cut to two rules and add the axis.** The axis
   matters more than the deletion.
3. **C4 (memory) — keep the precedence paragraph only**, pending anyone
   who can name the run.
4. **B — change nothing.** These trace to the founder's own documents and
   decisions. The test flags them; the test is not the author.
5. **`VOICE_BRIEF` — the founder's call**, and they should know it exists
   outside the test.

Nothing above is done. The next move is a decision, not a commit.
