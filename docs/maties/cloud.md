# The cloud engine — step 3 of the plan

September 11, 2026. Written before the code. The plan
(`docs/maties/plan.md`, sections 4 and 8) asks for this: one assistant,
two places to work, so that « the summary is already there when I wake
up ». This note says how, what it costs, what is dangerous about it,
and in what order it gets built. Change this note before changing the
shape.

## 1. What the person sees

Nothing new. That was decided on September 10 and it does not move: the
person sees Maties in one place, the app. There is no chat on the web.

- The morning briefing is simply there, as a conversation, when the app
  opens. If the app stays shut, it arrives by email or Telegram.
- What the assistant learned overnight is in its memory, so the first
  question of the day does not start from nothing.
- A routine carries one new word: **where it runs**, on this computer or
  in the cloud. Chosen for them by what the routine touches, changeable.
- Mail sent to the assistant's own address is answered, under the
  approval rules the person set.

## 2. The shape

Three pieces, in the order they matter.

**The memory, kept on Claidor.** The engine's memory is a handful of
text files in the agent's workspace: the durable facts, a note file per
day, who the person is, who the assistant is. Today each machine has
its own copy. Claidor keeps the shared one: both the computer and the
cloud read it before work and write it after. This is the piece that
makes two engines feel like one assistant, and it is worth having even
before the cloud exists: a person with two computers gets one assistant
instead of two strangers.

**The runner.** A new service on Claidor's servers that runs one piece
of work for one person and then stops. It is not a machine per person
sitting idle: it takes a job from a queue, lays out that person's
workspace, starts the same engine the app ships, lets it work, writes
the workspace back, and delivers the result. A job is a routine coming
due, or a piece of mail arriving, or a retry. Nothing needs a live
connection, because nobody is watching at three in the morning.

**The mailbox.** The assistant's own address. Mail to it reaches
Claidor, becomes a job, and the answer is sent from the same address.

## 3. The memory in detail

The files that matter, and how two sides can both write them without
losing anything:

| File | What it is | How it merges |
|---|---|---|
| the daily notes | one file per day, lines added as things happen | keep every line from both sides, in order, drop exact repeats |
| the durable facts | a list of things worth remembering | same: keep every block from both sides, drop repeats |
| about the person | a short profile | the newer one wins; the app writes it at setup, and the cloud never sends it up |
| who the assistant is | name, vibe, emoji | the app owns it; the cloud never writes it |
| the instructions | the managed section the app generates | the app owns it; the cloud never writes it |

The first two are lists, and lists merge by union, which is why this
works without locking anything. The app already recognises a memory
block and gives it a fingerprint, so « drop repeats » is code we have.
The last three are single documents with one owner, which is the app.

The runner therefore sends only the two lists back up, and this turned
out to matter more than it looks. The engine writes its own blank
template into any workspace missing one of those documents. A cloud run
that pushed them up would quietly replace the person's profile, and the
assistant's own name and character, with boilerplate. So the rule is not
a tidiness preference: the cloud reads all five and returns two.

Each person has one bundle on Claidor with a version. A side that
writes sends the version it started from; if the bundle moved on, it
merges and writes again. Small, boring, and it cannot silently lose a
fact.

**What never goes up.** The documents themselves, the library index,
anything read from the disk. Only the memory files, which are the
assistant's own notes. The trust page must say exactly that.

### The wire, exactly

One address, `POST /desktop/api/memory/sync`, with the app's usual
bearer token. The app sends every memory file it has and the version it
last saw for each; Claidor merges and sends back the truth.

```
POST /desktop/api/memory/sync
{
  "files": [
    { "name": "MEMORY.md", "content": "...", "base_version": 7 },
    { "name": "memory/2026-09-11.md", "content": "...", "base_version": 0 }
  ]
}

200
{
  "files": [
    { "name": "MEMORY.md", "content": "…merged…", "version": 8, "changed": true },
    { "name": "memory/2026-09-11.md", "content": "...", "version": 1, "changed": false }
  ],
  "deleted": []
}
```

- `base_version` 0 means « I have never seen this file from you ».
- `changed` true means the answer differs from what was sent, so the app
  writes the file back to the workspace.
- The answer always carries **every** file Claidor holds, so a fresh
  computer receives the whole memory by sending an empty list.
- A name is a relative path inside the workspace, from a fixed list:
  `MEMORY.md`, `USER.md`, and `memory/YYYY-MM-DD.md`. Nothing else is
  accepted, so no path can escape the workspace.
- Merging is Claidor's job alone, so the app and the runner cannot
  disagree about it.
- `deleted` names the files Claidor no longer holds. Today that is only
  the oldest daily notes, pruned once a person passes two thousand
  files. The app does not delete them from its own disk: memory is
  never taken away quietly. It only stops tracking their version.
- Refusals come back as a real HTTP failure with a reason, not as a
  success carrying an error number. A single bad name refuses the whole
  round and writes nothing, so a client can never half-sync. The
  older routes on this server answer inside a `{code, data}` envelope
  because the app that called them expected it; these two are new, so
  they answer with the body itself and use the status line for what it
  is for.
- Sizes: a file over a megabyte, or a round over eight, is refused
  whole.

## 4. The runner in detail

A job carries: whose it is, what to do, why, and what it may touch.

1. The queue hands the runner a job.
2. The runner opens a fresh container, asks Claidor for that person's
   memory bundle and lays it out as a workspace.
3. It starts the engine: the same tag the app ships, carrying the same
   patches, built into the runner's image.
4. The engine works. Every request to a model goes through Claidor's
   existing metered proxy on the person's account, so a cloud run costs
   the person's credits exactly as a run on their machine does.
5. When it finishes: the workspace goes back to the memory bundle, the
   conversation is stored so the app shows it, and anything to deliver
   is sent on the channel the job names.
6. The container is destroyed.

### The engine the cloud runs, exactly

« The same engine » is the promise this whole note rests on, so here is
what it costs to keep and where it is still not kept.

The engine is not what upstream publishes. `openclaw@2026.6.1` exists on
npm and installing it would take a minute instead of an hour, and it
would be a **different engine**: what the app runs is that source plus
the twenty-nine patches in `desktop/scripts/patches/v2026.6.1/`, and a
patch goes into the source before the build, not into the package after
it. A cloud engine built from the published package is the one mistake
this section exists to prevent.

It is not built on Render either. Render's build machine does not finish
the engine — a hundred and fifty-two workspace projects, and it stops at
`tsdown`. And when it was built there it was built from `runner/` alone,
which cannot see the patches at all: the cloud was running an unpatched
engine while this note said it was running the app's. So GitHub
Actions builds `runner/Dockerfile` on every change to the runner or to
the patches, applying them with the desktop's own script, and pushes the
image to `ghcr.io/spaire-tech/claidor-maty-runner`. Render pulls that
image and runs it. A developer running `docker build` runs the same file
and gets the same thing.

**What is the same:** the tag, the repository it comes from, the patch
set and the order it is applied in, the source build, the npm tarball
deciding which files ship, and production dependencies only.

**What is not, and it is not nothing:**

- *The gateway is not bundled.* The desktop packs the gateway entry into
  one file with esbuild, because Electron otherwise spends eighty to a
  hundred seconds resolving eleven hundred modules at every start. The
  image does not, and the runner starts an engine per job, so it pays
  that cost once per job — which is what the three-minute engine start
  timeout is for. It changes what a job takes, never what it answers.
  The day briefings are slow, this is the first thing to look at.
- *No `gateway.asar`.* That is Electron packaging; plain Node loads
  `openclaw.mjs` directly.
- *No plugins, no local extensions, nothing precompiled.* The desktop
  installs the Discord plugin and the library-search extension and then
  precompiles them to avoid a long first start. A cloud job may not call
  a plugin, has no channel and has no library, so none of the three is
  installed and there is nothing to precompile.
- *No channel dependencies.* That step works around a packaging bug in
  v2026.4.5–v2026.4.8, fixed upstream before the pinned tag. It is dead
  on both sides.
- *Not pruned.* The desktop strips source maps and type declarations and
  stubs out large packages to keep the installer small. The image only
  drops the engine's handbook and its dev dependencies. That is size,
  not behaviour.

So: the same answers, a slower start and a fatter image. The gateway
bundle is the only one of these worth revisiting.

**And the deploy is not automatic.** Render does not redeploy when a new
image is pushed to a tag, so a green build sits in the registry until
somebody deploys it. One click, and a real step that belongs in whatever
we write down as the way to ship.

### The job, exactly

The runner is the only thing that speaks these, with a token of its own
that belongs to the service and not to any person
(`CLAIDOR_MATY_RUNNER_TOKEN`). It never reaches Claidor's database.

```
POST /maty/runner/claim            { "runner": "<name>" }
  → { "job": null }                       nothing to do
  → { "job": { "id", "kind", "prompt", "deliver", "allow" },
      "access_token": "...", "expires_at": "..." }

POST /maty/runner/jobs/{id}/heartbeat  { "runner": "<name>" }
POST /maty/runner/jobs/{id}/complete   { "runner": "<name>", "result": "...", "usage": {...} }
POST /maty/runner/jobs/{id}/fail       { "runner": "<name>", "reason": "...", "retryable": true }
  → { "id", "status", "attempts", "scheduled_at", "lease_expires_at" }
  → 404 no such job · 409 not your lease, or it ran out, or the job is
    finished · 401 not the service token · 422 a body that makes no sense
```

Every one of the three carries the runner's name, because the name is
the only way to ask « does this caller still hold this job ». The first
draft of this note left it out and the answer was that any runner could
finish another's work.

**The token is the important part.** The runner holds no lasting
credential for anybody. When it claims a job, Claidor mints a token for
that one person that dies when the lease dies, and the runner uses it
for the two things it is allowed to do: read and write that person's
memory, and call a model through Claidor's metered proxy. So the work is
paid for out of that person's credits exactly as it would be on their
own machine, and a runner that is stolen holds nothing tomorrow.

A claim takes a lease. A runner that dies mid-job stops sending its
heartbeat, the lease runs out, and the job returns to the queue for
another try. After a small number of tries it stops and says so, rather
than looping forever on something that cannot work.

**The safety of this is not the same as on a laptop, and this is the
part to get right.** On the person's own computer the engine is
deliberately wide open: it may run any command, and the app asks the
person before anything dangerous. On our servers there is nobody to
ask, the work is often triggered by mail a stranger sent, and the
machine is ours, not theirs. So the cloud runner is the opposite by
default:

- A fresh workspace per job, deleted after, and nothing carried from one
  job to the next. The note first asked for a fresh *container* per job;
  Render runs one container that stays up, so what we actually get is one
  process doing one job at a time in a directory of its own. That is
  weaker, it is written here rather than glossed over, and the day a job
  needs to run something truly untrusted it moves to a sandbox of its
  own before that happens, not after.
- No shell and no commands at all. The tools the engine offers are an
  allowlist of three, reading, writing and editing, so a tool a later
  version of the engine adds is off until somebody turns it on
  deliberately. Files are held inside the job's own directory, and a
  path that climbs out of it is refused.
- **Reaching out is not walled, and this is the honest version.** The
  first draft of this note said the runner may reach three addresses and
  nothing else. The engine has no such setting: it can route everything
  through a filtering proxy somebody else runs, and that is all. So what
  we actually do is switch off every tool that touches a network, which
  leaves the model call and nothing else. The appetite is removed rather
  than the door locked. A real lock has to come from the network around
  the container, and the plan we are on does not offer one. Worth
  revisiting the day a job needs a tool that fetches.
- The engine's own sandbox stays off, and not for the reason it is off
  on a laptop: it is built on containers, and there is no container
  engine inside a container here. Turning it on would fail every tool
  call rather than contain one. What contains this is the tool list
  above and the container itself.
- The engine is started with an empty environment rather than the
  service's own, so the runner's service token, and anything else the
  service holds, never reaches it. The tokens it does need are handed to
  it by name and never written to a file, so a job directory left behind
  by a crash holds no credential.
- Anything that cannot be undone — sending, paying, deleting — is not
  done at night on the person's behalf unless they marked that routine
  as allowed to. Otherwise it is prepared and waits: a draft, and a line
  in the app saying « ready when you are ».
- Mail from outside is data, never instructions. A message that tells
  the assistant to change its instructions or send money is ignored, and
  the attempt is noted.

That last rule is a product rule as much as a technical one, and it
belongs on the trust page.

### The person's four routes

The four above are the runner's. Nothing in them creates work, and for a
while nothing did: the runner polled an empty queue because the only way
into the table was Claidor's own code. These are the app's way in, on the
desktop router with the desktop session, so they come out beside the
memory sync the app already speaks:

```
GET  /desktop/api/maty/jobs             → { "available": true, "jobs": [ job, … ] }
POST /desktop/api/maty/jobs   { kind?, prompt, deliver?, allow? }
                                        → { "job": job }
GET  /desktop/api/maty/jobs/{id}        → { "job": job }
POST /desktop/api/maty/jobs/{id}/cancel → { "job": job }

job = { id, kind, prompt, status, result, error,
        createdAt, startedAt, finishedAt }
```

**`available` is one fact, told twice.** It is whether a runner can reach
this Claidor at all — whether `CLAIDOR_MATY_RUNNER_TOKEN` is set. The
listing carries it so the app can hide the button; create refuses with
503 so a patched app cannot get past it. A Claidor with no runner must
read as « not available here », and never as a job that is accepted,
shown as waiting, and never done. That is the one failure this whole
section exists to prevent, because it is the one the person cannot see.

**A job is one person's and the routes say nothing else.** A job id that
belongs to somebody else answers 404, not 403, on both the read and the
cancel — the same answer as an id that never existed, in the same words.
403 would let anybody with a list of ids sift it for the real ones, and a
job id is the name of a piece of somebody's private work.

**`deliver` and `allow` are refused, not taken.** The app may send them
and is told no. They are the two fields that turn « the assistant drafted
this » into « the assistant did this »: `allow` is the send-and-pay marks
above, `deliver` is where an answer goes without anybody reading it
first. Neither is safe to take from a client — an app can be patched, and
a stranger's mail can end up inside a prompt — so both stay the server's
to decide, per routine, when there are routines to decide for. Until
then the cautious default is the whole story: the answer comes back to
the app, and nothing is sent anywhere. Refused rather than quietly
emptied, because a dropped `deliver` tells the person their briefing was
emailed when it was not. Widening this is its own piece of work with its
own thought, and it starts here.

**The caps, and why these numbers.** A prompt is at most eight thousand
characters — a page of instructions and the mail that provoked them, and
the prompt is what the engine is *told to do*, not the material it works
on; that comes from the memory and the library. An empty or
whitespace-only prompt is refused with 400 rather than queued as a job
with nothing in it. And one person may have ten jobs waiting or running
at once. Ten is not a quota on how much anybody may use the cloud —
finished work does not count, so a person who has used it a thousand
times is no more limited than one who never has. It is a ceiling on how
fast a mistake can fill the queue: a loop in the app gets ten refusals
instead of ten thousand rows.

**Cancel is for a job that has not started.** A `running` job is held by
a runner under a lease, in a container that is already working. Marking
it finished here would not stop that container, and the runner would
then complete or fail a job we had declared over — two writers on one
row, racing, for nothing. So a running job is refused with 409 and a
sentence saying it will stop on its own if it does not finish; the lease
is ten minutes. A cloud engine that can genuinely be stopped mid-flight
means the runner asking, between steps, whether it is still wanted. That
is a real feature and it is not this one.

A cancelled job is `failed` with « Cancelled before it started. » as its
reason, and not a status of its own. The table has four statuses and it
stays at four: a fifth would be a word the deployed runner has never
heard, for a difference the app can read off that sentence. The day the
app wants to *show* a cancellation differently from a breakage is the day
to add `cancelled` — to the model, the final set and the claim filter
together.

`startedAt` and `finishedAt` are columns on the job, added with these
routes. Neither could be derived from what was already there:
`modified_at` moves on every heartbeat, and `lease_expires_at` is a
deadline in the future that is cleared the moment a job finishes.
`startedAt` is stamped at every claim, so it is when the try that is
running began rather than when the first one did; `attempts` is what
counts the tries.

### What the app does with them

The routes above are half of it. The other half is what the person sees,
and section 1 said « nothing new », which is still the rule: no second
screen, no inbox, no page of jobs. Three small things instead.

**« Runs where » is a chip in the composer**, beside the model chip,
because both say how the next answer gets made. It reads « On this
computer » or « In the cloud », and changing it changes what the send
button does — in the cloud the work goes up to Claidor and nothing
starts here. **The chip is drawn only when `available` is true.** There
is no greyed-out version of it: a person who has no cloud engine never
learns there is a choice, which is the honest reading of a Claidor that
cannot do the thing. If Claidor switches it off between the chip being
drawn and the send, the 503 puts the choice back to « on this computer »
and says so, and the words stay in the box.

**Only the words travel.** The call carries a prompt and nothing else,
so attached files, the working folder and the chosen agent all stay on
this computer, and the toast says so when there were attachments. This
is the same rule as section 3's « what never goes up », and it is
worth the person hearing it at the moment it applies.

**Work in the cloud lives in one hairline strip above the composer**,
the shape the design already gives to a thing set aside (design.md,
section 4). One row per job: a dot, « Waiting in the cloud » / « Working
in the cloud » / « Done in the cloud », the first line of what was
asked, and at most one action — take it back while it is queued, show
the answer once there is one, put it away when it has been read. The
strip is on every chat screen and it is rebuilt from Claidor's own
listing, so a job sent last night is still there in the morning whatever
happened to the laptop. A finished answer opens in the assistant's own
voice, serif, in the app's own renderer.

A live job is never hidden and never put away: the person must be able
to find it long after the moment they sent it. « Put away » is the app's
own view of a *finished* job and nothing more — no job is deleted on
Claidor, and Claidor has no notion of a job having been seen.

**Watching stops, and says so.** The app asks Claidor every eight
seconds while something is live, and gives up after half an hour,
because the whole point of the cloud engine is that nobody has to sit
and watch. When it has stopped, the row says so with « Check again »
rather than leaving a shimmer running on nothing. Opening the app asks
once more, which is what makes « the summary is already there when I
wake up » true.

**A cancelled job leaves the strip.** Claidor records it as `failed`
with « Cancelled before it started. », which is the right row in the
table and the wrong row on the screen — a red mark about something the
person themselves stopped. So the app puts it away on a successful
cancel. It is not hidden from anywhere it still matters; it simply is
not news.

## 5. The mailbox in detail

The address is `name@` the domain we choose. Mail arrives at a vendor
that hands it to Claidor as a web request; Claidor turns it into a job;
the answer goes out through the same vendor from the same address.
Rules from day one:

- Only the person who owns the assistant can start work by writing to
  it. Mail from anyone else is kept and shown, never acted on.
- The address is the assistant's, not the person's. It never pretends to
  be them.
- Replies say plainly that they come from an assistant.

## 6. What it costs us

Honest figures, to be replaced by real ones after a month:

- A runner service on Render, one small instance, runs many jobs one
  after another. A briefing takes a few minutes of one core. Hundreds of
  people fit on one instance before a second is needed.
- Storage for the memory bundles is text, and tiny.
- The model calls are already paid for out of the person's credits, so
  the cloud adds compute, not model cost.
- The mail vendor charges per message and has a free start.

The plan already says we carry this compute and the pricing absorbs it.
Nothing here changes that.

## 7. What the founder must decide

Three things, and only three:

1. **The domain for the assistant's address.** The setup screen says
   `maties.ai`; the plan says `maties.com` is undecided. Whichever, it
   must be bought and its mail pointed at the vendor.
2. **The mail vendor.** Any of the usual ones works and the code will
   not care; one of them must be chosen and paid.
3. **The second Render service.** The runner is a new service and a new
   line on the bill, small but real.

None of these blocks the first piece of work.

## 8. The order of work

1. **The memory on Claidor.** Tables, the two ways in and out, the merge
   rules, and the app pushing and pulling. Needs no decision and no new
   spend. Provable on its own: two profiles on one machine end up with
   one memory.
2. **The runner.** The service, the queue, the locked container, the
   engine, the metering, the result becoming a conversation in the app.
3. **Routines in the cloud.** The « where it runs » label, the schedule
   kept on Claidor for cloud routines, the app showing what ran.
4. **The mailbox.** Once the domain and the vendor exist.

The briefing is the first thing built on top, and it is the proof:
nobody at the machine, and the answer is there in the morning.
