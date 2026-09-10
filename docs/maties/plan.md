# Maties — the plan of record

September 9, 2026. This is the plan for Maties, Claidor's desktop assistant
for office workers. It replaces nothing; the desktop app's technical notes
stay in `desktop/CLAIDOR-NOTES.md`. Change this document before changing
the direction, not after.

The two studies this plan answers, Town (town.com) and LobsterAI (NetEase
Youdao), are the founder's, dated the same day. The facts quoted below
come from them; the decisions are ours.

## 1. The business in one sentence

Town's business on Lobster's engine: a free download that becomes a paid,
named assistant per person, sold on credits, with team plans, where the
assistant lives on the person's own computer and knows every document
they have.

## 2. Four sentences we are allowed to say, and the ones we are not

These were wrong in the first draft and were corrected the same day. The
corrected versions are the only ones that go on the website, the trust
page, or a sales call.

**Price.** Same model cost as Town, none of the vendor cost (cloud
sandbox, cloud browser, integration and parsing vendors), no cloud
compute for work done on the machine. That is a modest saving, perhaps a
fifth to a third, not half. We say « more credits at the same price » and
set the number from a month of the gateway's own figures. We do not say
« twice the credits ».

**Privacy.** « Your files stay on your computer. Only what a task needs is
sent to the model, at that moment, and never stored or trained on. »
Stronger than Town because Town also uploads, and Town additionally keeps
its own copies of sessions and memories. We do not say « only the
questions leave »: to draft a reply from a contract the model reads the
contract.

**The library.** « Maties knows every document on your computer and answers
with the file and the page. » True only because the index is built on the
machine with a small local embedding model. Nothing is sent anywhere to
build it. We do not build the index by sending files to a cloud model;
that would upload the disk.

**Where it runs.** « Maties works on your computer, and the parts of your day
that only need email and calendar keep running in Claidor's cloud while
the laptop is shut. » See section 4. We do not say « purely local ».

## 3. What we copy, and from whom

From Town, in the order we build it:

1. A named assistant with a face and its own email address. People stay
   for the character. Decided September 10: a cast of ten to fifteen
   drawn characters in one style, each with four states (idle, working,
   waiting for you, done) and a preset voice. Simple and alive, not a
   talking human head: realistic faces look wrong, cost money every
   second, and nobody wants their assistant to be a deepfake. Voice is
   a feature, not a face: the morning briefing read aloud, and talking
   to the assistant from the phone. No animated mouth in a full spoken
   conversation. The founder designs the cast (illustration tools that
   keep one style across a set, then one that keeps a character the same
   across poses); the app animates it with a small state-machine runtime
   inside Electron; voices come from a speech service behind Claidor's
   API, never from a key in the app.
2. Onboarding with no blank box: within five minutes, a biography of the
   person built from their files and inbox, and five things Maties can do
   today. Ours reads the Documents folder and the mailbox on the machine.
3. The Wiki: a visible, editable page of what Maties knows about the person,
   refreshed nightly. The engine already keeps memory files; the Wiki is
   those files as a page.
4. Routines as a catalogue with categories and one-click install, and
   routines written in plain words. Twelve good ones. Auto-inbox first,
   because its effect is felt the same day.
5. Suggestions: « I noticed you do this every Friday. Want me to take it? »
6. The dial: approval by default, a read-only mode, per-routine and
   per-tool modes, permissions that reset per thread, a log with reasons.
   The engine already gates sensitive actions; we add the modes and the
   screen.
7. Credits with a flat per-credit overage and a spend cap at zero by
   default.
8. A public changelog and a release every few days.
9. Teams: pooled credits, shared routines and skills, admin controls, a
   shared activity feed.

From LobsterAI, already in our app and kept: the one-file installer, live
progress and the preview panel, skills as folders and kits per job role,
several agents each with their own chat bindings, scheduled tasks created
by conversation.

From neither: bring-your-own-key at launch. It leaks the revenue and Town
shows people accept not having it. Credits as a subsidy, Youdao's model,
only works with NetEase's user base behind it.

## 4. One assistant, two places to work

Town's best moment is « the summary is already there when I wake up ».
That works because Town's servers never sleep. A local agent does nothing
with the lid shut, and Youdao's own report says sixty percent of use is
evenings and weekends. So Maties is one assistant with two engines on one
account.

**On the machine.** Anything that needs files, local programs, or the
person's own logged-in browser. Runs when the laptop is on. A routine that
needs the machine and comes due while it is shut runs at the next wake and
says so.

**In Claidor's cloud, same account.** Anything that needs only email,
calendar and connected apps: the morning briefing, auto-inbox, meeting
preparation, and the assistant's own address receiving mail at three in
the morning. A per-person OpenClaw process on our servers, the same build
as the desktop's, sharing one memory store with the machine side.

Every routine carries a « runs where » label, machine or cloud, chosen at
creation with a default taken from what the routine touches, visible and
changeable by the person.

What this decides:

- **Gateway.** One account, two engines, one shared memory store that both
  sides read and write. The cloud engine is the main new piece of
  infrastructure in this plan.
- **Credits.** One allowance, spent from either side. Cloud routines cost
  the same credits as machine ones; we carry the compute, and the pricing
  absorbs it.
- **Trust page.** Two columns: what stays on the machine (files, the
  library index, local programs, the browser), and what the cloud engine
  holds (email and calendar access, connected-app tokens, the assistant's
  memory, and nothing from the disk).
- **The assistant's email address.** A server component from day one:
  mail to name@maties.com (the domain is not yet decided) is received on
  our servers, handed to the cloud engine, and answered on the person's
  behalf under the approval mode they set.

## 5. The library

Two libraries, not one.

**Personal, on the machine.** Built into the desktop app: an index of the
person's files kept in the app's own database, the parsing we already
have for Word, Excel, PDF and PowerPoint, embeddings from a small local
model, answers that cite the file and the page. Nothing leaves the machine
to build it; at question time only the fragments the task needs go to the
model, per section 2. This is the moat and it is ours to build.

**Team, in the cloud, opt-in.** WeKnora, Tencent's open-source document
knowledge base (a Go backend, a Python parsing service, a database with
vectors, Redis, object storage, run with Docker), reshaped the way
LobsterAI was: English only, Chinese services out, our domains only,
licence kept. A shared document base per team on Claidor's servers for
the Team plan, where a shared library is the point and the documents are
already in SharePoint or Drive. Named on the trust page as exactly that.
Its licence and current state are verified before a line is vendored.

## 6. Pricing, first draft

Set the credit numbers from a month of real gateway figures; the shape is
fixed now.

- **Free.** Download, sign in, a small monthly allowance, the weekly
  briefing.
- **Starter,** around twelve dollars a month.
- **Pro,** around thirty-nine dollars a month, more credits than Town's
  Pro at forty-nine.
- **Team,** per seat, pooled credits, shared routines and skills, admin
  controls.
- **Overage** at a flat rate per credit, spend cap at zero until the
  person raises it. No refunds; cancelling keeps the data and pauses the
  paid features.

Every price is a placeholder until the gateway has a month of numbers.

## 7. Trust

Local-first is the trust story now, in the exact words of section 2. The
artefacts follow in this order: a trust page with the two columns of
section 4 and the subprocessor list (Anthropic for the model, Render for
the cloud engine, the email vendor), a data processing agreement, then
SOC 2 when a customer with a compliance officer asks and not before.

## 8. Order of work

1. **The real conversation.** Sign in, send one message, get an answer
   through Claidor, with a screenshot. In progress.
2. **The personal library.** Local index, local embeddings, cited answers.
3. **The cloud engine per person.** Same build, shared memory, the
   assistant's email address. Before routines, because routines without a
   place to run at night is the Lobster mistake.
4. **The cast**, faces and voices. The founder draws the characters;
   the app shows them alive in four states, lets the person pick one and
   name it, and gives each a preset voice. The briefing read aloud comes
   with the cloud engine's briefing; phone voice comes with the channels.
   Added September 10.
5. **Onboarding**, the biography and five offers, with the choice of a
   character as its first screen.
6. **The Wiki.**
7. **Routines**, the catalogue and the plain-word editor, twelve stock
   routines, Auto-inbox first, each with its « runs where » label.
8. **The dial** and the log.
9. **Credits**, overage and the cap, from a month of numbers.
10. **Windows** as a first-class build, then the signed Mac build once
    Apple's enrolment is through, then the update feed.
11. **Teams** and WeKnora, after the first paying individuals.
12. Channels beyond Telegram, Discord and email: Slack, Teams, WhatsApp.

A release every few days, in public, with a changelog.

## 9. Risks we say out loud

Town has seventy-three million dollars, a16z, a team from Plaid and
Google, and shipped some three hundred and eighty changes this year. A
desktop app is harder to support than a cloud one. « For everyone » means
competing with Town, OpenAI, Anthropic, Google and Microsoft at once. The
local engine, the library on the machine, Windows, and the two-engine
account are what make Maties not a copy. The cloud engine costs us compute
that Town's pricing already carries and ours must.

## 10. Where things stand today

Done: the app reshaped from LobsterAI (English only, Maties branding, our
domains, Chinese channels and services out, provider and key screens
hidden); the account protocol on Claidor (browser sign-in, token
exchange and refresh, profile, quota, model list, a metered proxy to
Anthropic on Claidor's key) merged and live; the sign-in loop proven
end to end against a local Claidor with screenshots.

September 10: step 1 is proven. On the founder's Mac, from the unsigned
installer, the founder signed in, asked questions, and Maties answered
through Claidor, ran commands on the machine, found a full disk, and
asked before deleting anything. Two lessons for later steps: the fresh
engine asks « who am I to you, what should I be called », which is the
cast and onboarding (steps 4 and 5); and an approval prompt must show
the exact path and the exact command, so a person can decide without
knowing Unix (step 8, the dial). Step 2, the library, is built and in
the installer; the cited answer in the chat is still to be seen.

Not done: a signed Mac build (Apple enrolment is the founder's step);
the update feed; the account page on the web app; a designed icon;
everything from step 3 on.
