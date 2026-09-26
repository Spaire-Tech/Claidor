# Start here — Caisra

> **Superseded, 26 September 2026 (ledger F-426).** This brief describes
> the LobsterAI tree that commit `ce9fc2d8` replaced on 18 September:
> `desktop/src`, "2,552 files", the 23 strongs, Chief of Staff, whisper,
> the Mac tasks. None of it is in the tree. The current map is
> `docs/product/building-the-app.md` (the build loop) and
> `docs/product/grok-bot-layers-measured.md` (what is in `desktop/source`);
> the product's shape is in `CLAUDE.md` §"desktop/". This file is kept as
> the record of what the brief was; do not read it as a description of
> the repository.

The brief for a new agent joining this work. Read it before touching anything.

---

## What we are building

**Caisra: our own Grok Bot.** A person's AI teammates, living in a Mac app. You
message them like people. They have their own memory, their own jobs, their own
computer. They do real work on real files.

The founder's model for it is Grok Bot, and the difference that matters is
stated in `CLAUDE.md`: Grok Bot lives in the cloud and copies your file to its
machine and back — *"my computer ≠ your disk … we copy when needed"*. Caisra
opens the file where it lives. That shows up in spreadsheet formulas, links
between workbooks, folder structure, and privacy.

It is an app, not a website. That was decided, unwound, and decided again.

## Where the work is

**`desktop/` — 2,552 files. This is Caisra and this is where you work.**

An Electron app on LobsterAI (NetEase Youdao, MIT, vendored by `git subtree`;
keep the MIT notices). 102 files under `desktop/src` name Yodo or Caisra: the
agent and its brief, the 23 strongs, the roster card, Chief of Staff,
onboarding, the Messages design, the OpenUI cards and artifacts, whisper speech
recognition, the Mac tasks, the connections catalogue.

```
desktop/src/main/       the Electron main process, the engine, IPC
desktop/src/renderer/   the screens
desktop/src/shared/     what both sides use
```

**`server/polar/desktop/` — the backend Caisra talks to.** Python/FastAPI, live
on Render at `api.claidor.com`. Browser login, tokens, the metered model proxy
holding the OpenAI and Anthropic keys, memory sync, the skill/kit/MCP
catalogues. `server/polar/maty/` is the job queue and `runner/` the cloud
runner, for work that should happen without the laptop.

## Where the work is not

Three products share this repository. Two of them are not yours.

| Directory | What it is | Your business? |
|---|---|---|
| `desktop/` | **Caisra** | **Yes. This is the job.** |
| `server/polar/desktop/`, `polar/maty/`, `runner/` | Caisra's backend | Yes, when the app needs it |
| `corpus/`, most of `server/polar/` | **Claidor** — legal research for OHADA law | No |
| `clients/` | Claidor's web dashboard, Next.js on Vercel | No, except the token page |
| `server/polar/tieout`, `clients/…/Workspace` | **Swens** — model review for finance, archived | No. Tag `swens-final`. Never extend it |

If a task seems to be about OHADA legal texts or financial model review, you
have the wrong product. Ask.

## Read these, in this order

1. **`docs/product/direction.md`** — the founder's design, their words quoted,
   every code claim tied to a file. The product's shape. Read it before
   proposing anything about how Caisra should behave or look.
2. **`docs/product/what-exists.md`** — the inventory of what is already built.
3. **`CLAUDE.md`** — the operating history, including a list of things this file
   itself got wrong.
4. **`docs/product/going-back-brief.md`** — why the Rakazo attempt happened and
   why it ended, 17–18 September.

`docs/product/` also holds `agent-contract.md`, `caisra-build-map.md`,
`connectors.md`, `openui.md`, `review.md` and the design sources.

## How the founder works, and what they expect

They are the product owner and they merge. They are not an engineer and do not
want to be handed engineering as an explanation.

- **Short sentences, plain English, lead with the answer.** No preamble, no
  hedging, no em-dashes.
- **Say plainly what has not been run.** "Designed and checked" is not
  "working". They will trust an honest gap and will not forgive a confident
  wrong answer.
- **They find the real faults by opening the app.** Over four days in
  September, every real fault was found that way and none by any test. When
  they say something is broken, it is broken; the question is why, not whether.
- **They will challenge you.** "are u assuming that?" is a fair question and the
  answer is often yes. Check before answering, and say which part you checked.

## What this repository has learned the hard way

These are written down because each one cost real time. They are in `CLAUDE.md`
too; they are here because they are the difference between being useful and
being expensive.

**Read the log before reasoning about the failure.** A bug that took two hours
of guessing, including two confident wrong answers, was ended by one line. The
proxy records every provider refusal as `desktop.proxy.upstream_refused` with
the provider's own sentence in it. When something fails through the proxy, read
that first. When something fails anywhere and there is no log, the first job is
to ask *why there is no log* — not to propose causes.

**"X does not exist" is a claim that requires a search.** Before writing
*missing, absent, not built, nothing behind it, needs building*, grep
`desktop/src` and `server/polar`. If nothing is found, say what you searched
for. If something is found, it is a port or a wiring job, not a build. This
rule exists because an agent told the founder the onboarding Mac tasks had
"genuinely nothing behind them" — they are 178 lines of working AppleScript
with 107 lines of tests, which the founder had run many times.

**Check a diff before believing any claim about what a directory contains,
including a claim in `CLAUDE.md`.** That file described `desktop/` as untouched
upstream and told everyone not to add to it. It was true on 13 September and
false four days later, and nobody corrected it, so for a week the map described
the finished product as an empty parts bin.

**A silent failure path is a bug in itself.** A websocket handler destroyed its
socket on every error with no handler and no message. Three unrelated causes
produced one identical symptom and hours went into guessing between them. If
you are guessing, stop and instrument.

**Make it impossible to configure something that silently cannot work.** A
model was wired up with no vision capability. It had no screenshot tools, never
used graphical tools, and read as a stupid agent when it was a blind one.

## The state of things, 18 September 2026

**Working and live:** the Claidor backend on Render — `api.claidor.com` answers
now. The desktop protocol, the model proxy, memory sync, the maty queue, the
cloud runner. The Vercel dashboard (currently without its hostname, see below).

**In the tree and believed good:** all of `desktop/`. It is identical to
`b41c9364`, the state the founder judged good. Much of it has been run by the
founder; some has not.

**Unproven and stated as such:** whether the maty queue and `claidor-maty-runner`
actually deliver work while the laptop is shut. The app's browser — nobody has
run it in this tree; do not call it broken and do not call it fixed, run it and
read the gateway log. Voice input, which needs the whisper.cpp recogniser wired
up because the server serves text-to-speech but no speech recognition.

**Broken, and not yours to fix in code:** GitHub Actions dispatches no jobs in
this repository. Checks are created and die within three seconds with no runner
assigned. It is a repository or billing setting. Until it is fixed, **CI
confirms nothing** — run the gates yourself and say you did.

**Open and operational:** a Hetzner server left from the Rakazo attempt, now
serving nothing and costing money. `app.claidor.com` still pointing at it
instead of the Vercel dashboard; Google's OAuth origin and the S3 CORS rule on
`claidor-files` name that hostname too.

## The one open question about the product

Caisra runs the engine on the person's Mac, so **nothing runs with the laptop
shut**. That is the cost of being an app, and it was accepted knowingly.

`server/polar/maty/` and `claidor-maty-runner` are a cloud path built for
exactly this, and both are live. **How complete they are has never been
established.** Establishing that is probably the most valuable unclaimed work
in the repository, and nobody should promise a person that their routines fire
overnight until someone has.

## Rules that are not negotiable

- **This repository is public.** Never commit secrets, `.env` files, server
  addresses, or anything that helps someone log in. Review the staged diff
  before every commit.
- **Corpora and client files are never committed.**
- **Never disable TLS verification.**
- **No model identifiers** in commits, PR titles or bodies, code comments, or
  anything pushed to the repository.
- **Confirm before anything hard to reverse or outward-facing.**

## Where to start

Ask the founder what they want. They will tell you. This document exists so
that when they do, you already know which product it is, where the code lives,
what has been tried, and which of your confident instincts this repository has
already proved wrong.
