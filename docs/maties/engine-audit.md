# What the engine already gives us

September 11, 2026. An audit, not a plan. It answers one question: of
everything the agent engine we bundle can do, what do we ship and not use.
It changes no code and decides nothing. The plan of record is still
`docs/maties/plan.md`; where this note says « step 6 » it means that
document's order of work.

Read it with `docs/maties/cloud.md` beside it, because a surprising share
of the answer is « that belongs on the cloud engine, not the laptop ».

## 0. What was actually examined, and one correction

The engine is built from source into a folder the app ships whole. The
build is not the source tree: the engine's own packaging leaves out
thirty-eight of its parts and publishes them separately. Of what remains,
our packaging script deletes everything not on a short list.

The numbers, which matter for the rest of this note:

| | Count |
|---|---|
| Add-ons in the engine's source | 121 |
| Add-ons that reach our build | 97 |
| Add-ons our list keeps | 25 |
| **Add-ons our packaging deletes** | **72** |
| Instruction folders (« skills ») shipped with the engine | 57 |
| Pages of the engine's handbook shipped inside our installer | 668 |

The correction, and it is the important one: **seven names on our keep-list
match nothing.** They are `discord`, `feishu`, `qqbot`, `lobster`,
`acpx`, `memory-lancedb` and `speech-core`. The first six are published
separately by the engine's authors and never arrive in the build at all;
we install one of them (chat on Discord) by hand, the same way we would
have to install any other. The seventh, `speech-core`, does not exist
under that name anywhere. So the keep-list reads as though it protects
thirty-two things and in fact protects twenty-five.

This distinction runs through the whole report. **Present but unused** is
one answer. **Deleted by our own packaging** is a second. **Never in the
build, sold separately** is a third. They cost very different amounts to
change and I have kept them apart.

The files that decide all this:

```
desktop/scripts/prune-openclaw-runtime.cjs      the keep-list
desktop/package.json  →  "openclaw"             the pinned engine, and the one add-on we install
desktop/src/main/libs/openclawConfigSync.ts     what we switch on in the engine
desktop/src/main/plugins/pluginManager.ts       what the Plugins screen refuses to show
desktop/electron-builder.json                   what goes into the installer
```

One more thing worth saying at the top, because it governs several
findings below. Our configuration writes a **strict list of permitted
add-ons**. Anything not named on that list does not load, even if it is
sitting there on disk and even if it is switched on elsewhere. Three of
the things this report calls « present but unused » are unused for exactly
that reason.

---

## 1. The free wins

Present in what we ship, needing no new supplier, serving a step of the
plan. Ordered by what they are worth to the plan.

### 1.1 The Wiki is already written — step 6

**What it is.** A machine that turns the assistant's scattered notes into
a tidy set of pages: one page per person, per project, per idea, per
recurring summary, plus dashboards. Each page holds separate statements
rather than prose, and each statement carries how sure it is, what it was
drawn from, what contradicts it, and what is still an open question. A
person page can hold handles, addresses, time zone, what this person is
good for and what they are not, and how confident the assistant is about
each. It can read what the memory system already writes — the daily
notes, the durable facts, the nightly summaries — so it does not need a
separate source of truth. Pages are ordinary text files, so a person can
edit them by hand.

**Is it in our build.** Yes. It is one of the twenty-five we keep.

**Does our app expose it.** No, twice over. It is not on the strict list
of permitted add-ons, so the engine never loads it. And it is written into
the list of things the Plugins screen must never show
(`desktop/src/main/plugins/pluginManager.ts`), so a person could not
switch it on if they wanted to. Nothing else in the app mentions it.

**Which step, and how much work.** Step 6, the Wiki, which the plan
describes as « a visible, editable page of what Maties knows about the
person, refreshed nightly ». That is close to a description of this thing.
A few days: permit it, point it at a folder, choose the mode that reads
the existing memory, then build the one screen that shows the pages. It
replaces most of the step. What it does not replace is the nightly
refresh and the look, which are ours.

**The honest caveat.** The mode that feeds off existing memory only works
if the memory system is exporting the right artefacts. The handbook says
plainly that it can report zero and that this is normal until the memory
side is set up. I could not test this without running the engine. Budget
half of the « few days » for finding that out.

### 1.2 The dial exists in the engine — step 8

**What it is.** A single setting that decides how much the assistant may
do on its own before it must ask. Five positions: refuse everything, only
things on a known-safe list, ask about anything new, ask only about what a
built-in reviewer cannot clear, and never ask. The choice is the engine's,
not something we would have to invent.

**Is it in our build.** Yes — it is part of the engine itself, not an
add-on, so no packaging decision touches it.

**Does our app expose it.** No. We pin it to « never ask » and write that
into the engine's approvals file on every start
(`openclawConfigSync.ts`), then catch dangerous commands ourselves with
our own question card. That is already documented as a known posture in
`desktop/CLAIDOR-NOTES.md`. There is no screen, no per-routine choice, no
read-only mode.

**Which step, and how much work.** Step 8, the dial and the log. The plan
says « the engine already gates sensitive actions; we add the modes and
the screen ». The modes exist; only the screen, the per-routine choice,
and the log are ours. An afternoon to stop pinning it and let a setting
choose; a few days for the screen, the per-thread reset and the log.

### 1.3 Natural follow-ups — step 5's « suggestions », the gentle half

**What it is.** The assistant notices, from an ordinary conversation, that
there will be something worth asking about later — you mentioned an
interview tomorrow, you said you were exhausted, it promised to come back
to something — and remembers to raise it at a sensible moment. It is
deliberately not a reminder. Reminders are exact and asked for; these are
inferred and never asked for. They are tied to the one conversation and
the one place they came from, so they do not resurface somewhere
embarrassing.

**Is it in our build.** Yes — part of the engine, off by default.

**Does our app expose it.** No. The word does not appear anywhere in our
source.

**Which step, and how much work.** Step 5, « I noticed you do this every
Friday. Want me to take it? », or rather its softer cousin. An afternoon
to switch on. Two things must be true first: the engine's periodic
check-in must be running (ours is off by default) and it must have
somewhere to deliver (ours is set to « nowhere »). Then a few days to
make it feel like the character rather than a notification.

**The cost, said plainly.** Every eligible reply triggers a hidden second
pass over the conversation to decide whether there is a follow-up in it.
That is real money on the person's allowance, quietly, all day. There is a
cap on how many follow-ups per day but not on how many times it looks. I
would not switch this on before credits (step 9) can show what it costs.

### 1.4 The assistant can draft its own routines — steps 5 and 7

**What it is.** The person describes something in ordinary words; the
assistant writes an instruction folder for it; the folder is held as a
**proposal** and does nothing until a human approves it. Approval is the
only thing that makes it live. Proposals are scanned before they are
applied, bound to the exact version they were drafted against so a stale
one is refused, and reversible. It only ever writes into the person's own
folder, never into anything we ship.

**Is it in our build.** Yes — part of the engine.

**Does our app expose it.** No. Our Skills screen installs and toggles;
it does not propose.

**Which step, and how much work.** Step 7's « routines written in plain
words », and step 5's suggestions. A few days: a screen showing pending
proposals with Approve and Reject. The approve-first shape is exactly
what the trust story needs and we would otherwise have designed it
ourselves.

### 1.5 Progress that shows in Telegram and Discord

**What it is.** When the assistant is working, one message appears in the
chat and keeps rewriting itself — a word for what it is doing, then short
lines as real work happens — and finally becomes the answer. Instead of a
pile of « working on it » messages, or silence for two minutes.

**Is it in our build.** Yes — part of the engine, per channel.

**Does our app expose it.** The choice exists in our code
(`desktop/src/main/im/types.ts` carries all four settings) and our default
is off. It is not offered in the channel settings screen.

**Which step, and how much work.** Not a step of its own; it is the
difference between the assistant feeling alive and feeling broken outside
the app, which matters from step 3 onwards when work happens while the
laptop is shut. An afternoon: change the default and show the choice.

### 1.6 Nightly consolidation, already ours

**What it is.** Overnight the assistant re-reads its recent notes, decides
which ones have earned a place in long-term memory, promotes those, and
writes a short human-readable diary of what it noticed.

**Is it in our build.** Yes.

**Does our app expose it.** Yes, fully: a settings tab of its own, an on
switch, five cadences, and a reader for the diary
(`desktop/src/renderer/components/cowork/DreamingSettingsSection.tsx`).

Listed here not as a gap but because it is the other half of step 6. The
Wiki of 1.1 is the page; this is the thing that keeps it fresh. They were
designed to sit beside each other.

### 1.7 Scheduled work, with more in it than we use — step 7

**What it is.** The engine's own scheduler. It survives restarts, keeps a
history of every run, and can deliver the result to a chat channel, to a
web address, or to nobody. A job can run in a fresh conversation each
time, or in the same conversation so it builds on last week, or in the
person's main conversation. A job can name a different place to send
failures. One-shot jobs delete themselves.

**Is it in our build.** Yes — part of the engine.

**Does our app expose it.** Partly, and better than I expected. There is
a Scheduled Tasks screen with a list, a form, run history and a template
picker, and six templates already written: a technology briefing, an
end-of-day wrap, meeting preparation, a weekly report, a project health
check and a monthly admin pass. What is not exposed: the choice of a
continuing versus a fresh conversation, the separate destination for
failures, and delivery to a web address.

**Which step, and how much work.** Step 7 asks for twelve good routines in
a catalogue with categories. Six exist. The remaining engine features are
an afternoon each. The « runs where » label the plan asks for is ours to
build and belongs with the cloud engine, not here.

### 1.8 Fifty-seven instruction folders we ship and never mention

**What it is.** The engine ships its own folder of instructions for
working with particular things. Among them: reading and sending mail over
the ordinary mail protocols; Google's mail, calendar, drive, contacts,
sheets and documents; Apple Notes and Reminders; Obsidian and Notion;
summarising a link, a video or a podcast; searching the person's own past
conversations; the weather; a password manager; issue trackers; a Mac
screenshot and window tool.

**Is it in our build.** Yes, all of them, 712 KB, inside the installer.
The engine loads them at a low priority beneath our own seventeen, and
hides any whose helper program is missing.

**Does our app expose it.** No. The Skills screen lists our seventeen.
The engine's fifty-seven are invisible to the person, and most are
inactive because the helper program they need is not installed — though
each one knows how to install its own helper.

**Which step, and how much work.** Step 7's catalogue, and step 5's « five
things Maties can do today ». A few days to build a shelf that shows the
relevant ones, explains what each needs, and offers to fetch it. The
judgement to make first is which we are willing to stand behind: this is
the same question the founder raised on September 11 about the open skill
registry, one size smaller and one degree safer, because these fifty-seven
come from the engine's authors rather than from strangers.

### 1.9 A working control panel, already served

**What it is.** The engine serves a small web page on the local machine
with a chat, an activity view, the configuration, the paired devices and
a view of the nightly consolidation. It is already unpacked and served by
our own engine manager (`openclawEngineManager.ts`) because the engine
needs it present to start.

**Is it in our build.** Yes.

**Does our app expose it.** No, and it should not: it carries the
engine's name and vocabulary throughout. But it is running, on the local
machine, on the engine's port, today.

**Which step, and how much work.** None. It is a free support and
debugging surface for us, available now, at zero cost. Worth knowing
about the next time something is wrong on the founder's Mac.

### 1.10 Session tools, and a written record of every conversation

**What it is.** Two things. The first: the assistant can list its other
conversations, read one, send a message into one, and start a background
helper that reports back. We already use the last of these. The second:
the engine can write every conversation to disk as a transcript with a
summary beside it, dated, one folder per day.

**Is it in our build.** Yes — both are part of the engine.

**Does our app expose it.** Background helpers, yes. Cross-conversation
tools and the written transcripts, no.

**Which step, and how much work.** The transcripts are quietly useful for
step 5: the biography the plan wants built « from their files and inbox »
could equally be built from what the assistant has already been told. They
also feed the nightly consolidation. An afternoon to switch on, a few days
to use well. Note the privacy consequence before switching anything on:
this writes conversations to disk that are not on disk today, and the
trust page would have to say so.

### 1.11 A proper client for the cloud engine — step 3

**What it is.** The engine's authors publish a small typed library for
programs that want to drive the engine from outside: start a piece of
work, watch it, wait for it, cancel it, read the conversations, invoke one
tool, fetch the transcripts, answer approval requests.

**Is it in our build.** No — it is a separate free download, not part of
the engine package.

**Does our app expose it.** No. Our desktop app talks to the engine
through hand-written code of its own
(`src/main/libs/agentEngine/openclawRuntimeAdapter.ts`), which is fine and
already works.

**Which step, and how much work.** Step 3, the cloud runner. The runner
described in `docs/maties/cloud.md` section 4 has to start the engine,
let it work, and collect the result. This library is exactly that job,
already written and maintained by the engine's authors. Free, and it would
save the runner a week. Worth an hour of the founder's engineer before
writing that part by hand.

---

## 2. The cheap purchases

Present in what we ship, but useless without an account or a key
somewhere. Naming the supplier turns a « free feature » into a line on a
bill.

| What | Who you must pay | For what |
|---|---|---|
| A voice for the assistant | OpenAI, or Google, or one of four others | Turning replies into speech. Keeps step 4's promise of « the briefing read aloud ». |
| A spoken conversation | OpenAI or Google | Continuous back-and-forth speech, the half of step 4 the plan already says is for the phone. |
| Searching the web properly | xAI, Google, Moonshot, MiniMax or OpenRouter | Search, through a model supplier's own service. |
| Mail arriving waking the assistant | Google Cloud, plus a public address | The « auto-inbox » trigger of step 7. See the warning below. |
| Real phone calls | Twilio, Telnyx or Plivo, plus a public address | Step 4's phone voice. See section 4. |

Three notes on this table, each of which changes a decision.

**Voice.** Every speech supplier that needs no key at all — the built-in
Windows and Mac voices, and the local command-line one — is deleted by our
packaging. What survives all need a key. This is not a problem: the plan
already says « voices come from a speech service behind Claidor's API,
never from a key in the app », so the key is ours and the person never
sees it. But it means voice is a Claidor cost from the first day, not a
free engine feature, and the account has to exist before step 4 can
finish.

**Search.** Our own configuration currently forbids the engine's search
tool outright (`openclawConfigSync.ts`) and steers the assistant to the
browser or to our own search instructions instead. Separately, our
packaging deletes every one of the nine standalone search suppliers,
including the two that need no key. So search today is the person's own
browser. That is a defensible privacy position and it should be a stated
one rather than an accident.

**Mail triggers.** The engine's way of being woken by new mail wants a
Google Cloud project, a separate command-line program that is not shipped,
and an address on the public internet that Google can call. A laptop
behind a home router has none of those. This is not a cheap purchase; it
is a small project, and it is the wrong shape for us anyway. The mailbox
described in `docs/maties/cloud.md` section 5 — mail arrives at a vendor,
the vendor calls Claidor, Claidor makes a job — is both simpler and the
only version that works while the laptop is shut.

---

## 3. Pruned by us

Seventy-two things arrive in the build and our packaging deletes them.
The reason for the deletion was startup speed and installer size, and it
was a good reason: the engine scans every folder it finds at boot, and on
Windows that cost about thirty seconds. But the list was written to keep
what the app used in September, not to keep what the plan needs.

Turning one back on costs **one line** in
`desktop/scripts/prune-openclaw-runtime.cjs` and a rebuild. A few also
need a line in the strict permitted-list in `openclawConfigSync.ts`.
Neither is more than an afternoon. The cost is paid in startup time and
installer size, a little per item.

The ones worth reconsidering, with what they do:

| Deleted | What it does | Why it matters |
|---|---|---|
| `document-extract` | Pulls the text out of an attached document, and falls back to pictures of the pages | We built a document reader for the library; this is the one for things a person sends the assistant |
| `web-readability` | Strips a web page down to the article | Every « summarise this link » routine |
| `active-memory` | Looks things up in memory *before* replying, rather than waiting to be asked | The difference between an assistant that remembers you and one that can be asked to |
| `workboard` | A board of cards the assistant picks work from, with the assistant able to dispatch its own workers | Step 7, and the « shared activity feed » of step 11 |
| `webhooks` | Lets an outside service call in with a password and start work | Anything that has to react to the world |
| `migrate-claude`, `migrate-hermes` | Import instructions, connections and memories from another assistant | Step 5 onboarding, for people arriving from somewhere else |
| `imessage`, `signal`, `sms`, `irc`, `mattermost` | Five more places to reach the assistant | Step 12, and cheaper than the ones listed there |
| `duckduckgo`, `searxng` | Web search needing no key | The only free search we had |
| `microsoft`, `tts-local-cli` | Speech using the voices already on the computer | Free speech, deleted |
| `elevenlabs`, `azure-speech`, `deepgram`, `inworld`, `gradium`, `senseaudio` | Six more speech and transcription suppliers | Choice, if the first one disappoints |
| `file-transfer`, `device-pair`, `phone-control`, `canvas` | The paired-device family: moving files to a phone, approving a device, arming its camera, drawing on its screen | Only useful with a companion phone app, which we do not have. See section 4. |
| `policy` | Checks the workspace against rules and reports what is wrong | Support |
| `oc-path` | A stable way to name files inside the assistant's workspace | Small, useful for the cloud runner |
| `admin-http-rpc`, `diagnostics-otel`, `diagnostics-prometheus` | Health and metrics out of the engine | The cloud engine will want one of these |
| Forty or so model suppliers | Anthropic's competitors | Correctly deleted; we sell one account, not a menu |
| `video-generation-core` | Making video | Correctly deleted, per `CLAIDOR-NOTES.md` |

And one piece of housekeeping: `speech-core` sits on the keep-list and
matches nothing in the engine, so the list is quietly protecting a name
that does not exist.

---

## 4. Not what it sounds like

Six things whose names promise more than they deliver. I would rather be
blunt here than let one of them into a plan.

**Standing orders are not a feature.** They are a page of advice about how
to write the assistant's instructions file, with example paragraphs. There
is no code behind them, no setting, nothing to switch on. The whole idea
is « write down what the assistant is allowed to do in the file that gets
read at the start of every conversation ». We already generate that file
and already manage a section of it
(`desktop/src/main/libs/openclawVoicePrompt.ts` writes one). So this is
not step 8; it is a paragraph we could add this afternoon. Useful, but
free in the way a sentence is free, not in the way a feature is free.

**Task Flow and the « inbox triage » example are for programmers.** Task
Flow is bookkeeping for work that spans several steps: which step are we
on, what state have we saved, what are we waiting for, has the engine been
restarted since. It has no picture, no editor, and nothing a person would
ever see. The instruction folder called « inbox triage » looks at first
glance like the auto-inbox routine of step 7 and is in fact a worked
example for somebody writing an add-on, with sample code in it. It routes
nothing. Neither is step 7.

**Phone calls are further away than « present but pruned ».** This is not
something we ship and delete; it is not in our build at all. It is
published separately and would have to be installed the way we install
chat on Discord. Then it needs a telephone number from a carrier, and —
the part that actually decides it — an address on the public internet that
the carrier can call when the phone rings. A laptop behind a home router
does not have one, and the engine's answer to that is a tunnelling
service, which is another supplier and another thing to explain on the
trust page. So the earlier judgement that calls were a big job was right
about the desktop and wrong about the reason. **On the cloud engine of
step 3, which already has a public address, most of the difficulty
disappears.** That is where telephony belongs, and it should be revisited
the day the runner stands, alongside the founder's September 11 finding
about ready-made calling skills.

**« Nodes », « devices », « pairing » and the setup code are about a phone
app we do not have.** Every one of these is machinery for pairing the
engine's own iPhone, Android and Mac companion applications to the
engine, so that the assistant can use that phone's camera, screen,
location and notifications. They are not a way to put Maties on a phone.
They would become interesting only if we shipped a companion app of our
own, which is not in the plan. Until then they are the wrong answer to
« can I talk to my Maty from my phone ». The right answer today is
Telegram, which we already have.

**Backup backs up the engine, not the person.** It archives the engine's
own folder: its configuration, its saved credentials, its conversations,
its workspace. It does not touch the person's documents, the library
index, or our database. It is a support tool for us, not a promise we can
make to a customer.

**The handbook search does not search the handbook.** The engine's
documentation command calls a website. Meanwhile the installer carries
8.5 MB and 668 pages of that handbook — the engine's own name on every
page — for no reader I could find. Either something should read it
locally, or it should not ship.

**One more, smaller.** The follow-ups of section 1.3 are not reminders and
cannot be made into reminders; a person who says « remind me at three »
goes down the scheduling path instead. And the Wiki's third mode, the one
that reads anywhere on the disk, is marked experimental by its own authors
and is the one mode we must not use.

### Which of these are experimental

The engine marks only four things as experimental, and none of them is in
this report: a lean mode for small local models, an experimental way of
searching past conversations, a sandbox option for a coding harness we do
not use, and a structured planning tool. The Wiki, the nightly
consolidation, the follow-ups, the approval modes, the scheduler, the
progress messages, the skill proposals and the transcripts are all
ordinary documented features. Three things named above *are* flagged
experimental by their own pages: the Wiki's read-anywhere mode, the
drawing surface for paired devices, and the keyless DuckDuckGo search.
So we can lean on the things in section 1.

---

## 5. What I could not establish

Said plainly, because each of these could change a number above.

- ~~**Whether the Wiki actually starts once permitted.**~~ **Settled,
  September 11.** The worry was that the engine might seed its own
  permitted-list, in which case the Wiki would already be permitted and
  merely hidden. It does not. In the generated config on a machine that
  has run the engine, `plugins.allow` is null and `plugins.entries` is
  empty; nothing in the engine's bundle ever writes an allow list into
  the config file. So the list we assemble in `openclawConfigSync.ts`
  (line 2708) is the whole list, the Wiki is not on it, and the engine
  never loads it. Both locks in 1.1 are real. The remaining unknown is
  only what the Wiki does once permitted, not whether it is blocked.
- **Whether the Wiki's bridge mode finds anything.** It reads what the
  memory system exports. Our memory setup is not the default one. The
  handbook says zero exports is a normal and expected outcome. Untested.
- **Whether the engine's fifty-seven instruction folders are visible to
  the assistant today.** The loading rules say they should be, filtered by
  which helper programs are installed. I did not run the engine to see
  what survives that filter on a clean Mac.
- **What the follow-up feature costs per day.** It runs a hidden second
  pass after eligible replies. I found no figure for how often « eligible »
  is, and it is the whole cost.
- **Whether the progress message works on our Telegram and Discord.** The
  setting exists in our code and the engine supports it; our chat
  connection is partly our own. Untested.
- **Whether our strict permitted-list is silently blocking things we
  keep.** The list is assembled from what the engine seeded plus what we
  add. If the engine stops seeding something on an upgrade, a kept add-on
  goes quiet with no error a person would see. Worth one test.
- **Why six names on the keep-list never arrive.** I established *that*
  they are published separately; I did not establish whether any of them
  was ever expected to arrive, or whether those lines are simply stale.
- **What the installer weighs today.** I measured the engine folder but
  not a finished installer, so I cannot say what turning items back on
  actually costs a person downloading it.

---

## 6. If only three things were done

Not a decision, an opinion, and the founder's to overrule.

1. **Permit the Wiki and look at it.** Half a day to find out whether
   step 6 is mostly built. Nothing else in this report has that ratio.
2. **Stop pinning the approval setting.** The five positions of step 8's
   dial already exist in the engine. Using them is an afternoon; the
   screen is the real work and can follow.
3. **Take `document-extract` and `web-readability` off the deleted list.**
   Two lines. Reading an attachment and reading a web page are the two
   things an office assistant does all day, and we currently delete both.
