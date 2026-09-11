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
3. It starts the engine, the same build the app ships, already built
   for Linux in this repository.
4. The engine works. Every request to a model goes through Claidor's
   existing metered proxy on the person's account, so a cloud run costs
   the person's credits exactly as a run on their machine does.
5. When it finishes: the workspace goes back to the memory bundle, the
   conversation is stored so the app shows it, and anything to deliver
   is sent on the channel the job names.
6. The container is destroyed.

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
