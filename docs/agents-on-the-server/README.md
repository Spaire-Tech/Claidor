# The agents on the server, the computer as their hands

A plan, 4 November 2026. Nothing in it is built yet.

## What the founder asked for

> "the computer should NOT BE USED FOR THINKING OR SIMPLE ACTIONS, LIKE
> TALKING TO THE AGENT or using connectors etc. … you should use the
> computer whenever the work cant be done thru a connector. websites,
> running code/commands, making files, logins that sticks, routine. one of
> the whole point of the computer is to be able to do work when the mac is
> off."

So:

- **On the server, always on, nothing to wake:** the agents' thinking,
  talking to them, connectors, memory, the cards, the routines' schedule,
  Discord and Slack replies, approvals.
- **On the computer, woken only for it:** websites (its Chrome and the
  sign-ins that stick there), running code and commands, making and keeping
  files, the screen for Take control.
- **While none of the person's devices is connected** (Mac, Windows PC,
  iPhone all off), the computer is where that work gets done. That covers
  routines, what comes in (an email, a Slack or Discord message, a
  listener's event), and tasks that keep going after the app is closed.
  The thinking stays on the server; the computer is woken for the steps
  that need it.

## How the app behaves when it is done

**Never wakes the computer:**
- opening the app on the Mac, the Windows PC or the iPhone: agents and
  chats are there at once;
- talking to an agent: the reply comes from the server;
- connectors (email, calendar, Slack, Notion…);
- memory, making or changing agents;
- answering a card (a question, an approval, a form, a draft), unless the
  card is about the computer itself;
- a routine that only uses connectors;
- an email or a message coming in that the agent can handle with
  connectors;
- opening a file an agent already made. Every finished file is copied off
  the computer to the server automatically, as soon as it is finished, and
  opens from there.

**Wakes the computer, in about a second:**
- a website (its Chrome, where the sign-ins stay);
- running code or commands;
- making or changing files on it;
- the person opening its screen or pressing Take control;
- a "Your turn on the computer" card.

**The sleep timer:** the computer sleeps 10 minutes after its work ends,
never in the middle of it. Two things keep it awake for as long as they
last:
- a job running on it;
- an open screen or Take control session.

Today a running job already keeps it awake (`BoxHealth.holds_awake`). An
open screen most likely does too, since its connection to the proxy does
not carry the app's "let it sleep" mark (`box_proxy.keep_attached`), but
that is not confirmed. Step 0 checks both.

**In practice:**
- **The person closes the app mid-task.** The agent goes on, on the
  server, and wakes the computer if it needs it. The result is in the chat
  next time, with a notification.
- **All devices are off.** Routines run at their time, emails and messages
  that come in are handled, and the computer does the website, code and
  file steps. It all waits in the chats.
- **A stranger writes.** The agent reads it and answers with no tools.
- **The computer restarts or updates.** Nothing breaks: cards, chats and
  tasks live on the server. Updates happen while it is quiet, and the logs
  say what happened.
- **The computer can't wake.** The agent says so in the chat, plainly. It
  never fails silently.

The browser in the Mac and Windows apps is not used: websites open on the
computer only.

## How it is today (read in the code, 4 November 2026)

- **The whole engine runs inside the computer.** `desktop/source/host` is
  started there by the supervisor (`box/bin/simeon-supervisor.mjs`,
  `SAND_HOST_IN_BOX=1`). Its data is there too: agents, chats, memory and
  settings, in `/home/box/sand-data`. So a message, a connector call or a
  card answer each need the computer awake. A card the engine keeps only in
  memory breaks when the computer restarts (#565).
- **Already on the server:**
  - the model calls (the API's metered proxy);
  - a copy of each chat, and the inbox for messages sent while the computer
    sleeps (#420);
  - the connectors' accounts (Pipedream and Composio hold them,
    `server/simeon/connectors`);
  - a copy of memory (`desktop/memory_merge.py`);
  - the Discord and Slack connections (the runner holds them; the computer
    replies).
- **The cloud runner** (`runner/`) answers queued jobs with one model call
  and no tools at all (`runner/README.md`). It is not a brain the agents
  could move into.
- **The engine reaches its "hands" through a network address.** The hands
  are the computer's exec daemon (`desktop/source/box-exec-daemon`). It
  runs commands, reads and writes files and starts the browser driver, at
  `127.0.0.1:1337`, with a token (`host/box/loopback-sand-box.ts`,
  `BoxEndpoint`). The browser tools are a script the engine runs on the
  computer through it (`sand-browser-driver-source.ts`). Whether all of it
  works from outside the computer has never been tried. Step 0 proves it.

## The design

**One engine, moved, not rewritten.** The same engine runs on Simeon Labs'
side, one process per person. The apps keep talking to it the way they do
now, through the API's proxy (`box_proxy.py`). Only where the proxy sends
them changes, from the computer to the person's engine. No app is rebuilt.

**Its hands are the computer.** When a step needs the computer, the engine:

1. asks the API for the computer, which wakes it in about a second on E2B;
2. sends the step to the computer's exec daemon, through the proxy, with
   the computer's token;
3. lets the computer go back to sleep when the work is done.

| Stays on the computer | Moves to the person's engine on the server |
|---|---|
| Shell and code (`Shell`), files in `/workspace` (`Read`, `Write`, `Edit`, file transfer) | Thinking and replies, sub-agents |
| Chrome and its sign-ins (browser tools, browser-use and computer-use helpers, checkout, Duffel's pay page, 1Password and saved-password fills) | Connectors (Pipedream and Composio's remote servers) and web search and fetch |
| The screen, Take control, the video helper | Memory, settings, the agents and their chats (`sand-data`) |
| Connectors that only run as a program on the computer (`LoadMcpServers`) | Cards and approvals, `SendMessage`, drafts, reactions, forms, secrets |
| | Routines' schedule, listeners, Discord and Slack replies, sharing |

**Where it runs.** A new Render service, "the brain". It runs one engine
per person, starts it when the person or a routine needs it, and stops it
after a quiet while. Each person's data sits on the service's disk, backed
up the way the computer's is (`box_store.py`, S3). It runs no command of
the agent's: those all go to the computer.

## Not breaking anything

Simeon has one person on it, the founder ("ive no customer. its just me"),
so there are no switches for other people and no step for "everyone".
Two rules hold:

- **The founder's data is backed up before anything moves**, and the
  computer's engine is kept until the new one works.
- **Every step logs what it decided**, so nobody has to guess from outside,
  as on 4 November. Each step is checked on the founder's Mac: sending a
  message, using a connector, opening a website and running a routine.

## The order of work

0. **Prove it.** Run the engine outside a computer,
   here and against a stand-in computer, then against the founder's
   computer through the proxy. Measure:
   - which of the five `SAND_HOST_IN_BOX` places, and which paths that
     assume `/home/box`, break;
   - whether commands, files and the browser driver work over the network,
     and how slowly;
   - the engine's memory and CPU at rest and during a turn.

   This gives the real cost and the list of changes.
1. **The brain service.** The founder's engine on Render, with their data
   copied from their computer's backup. The proxy sends
   their apps to it; their computer is reached only for its hands. Checked by talking to an
   agent and using a connector with the computer asleep, then opening a
   website, which wakes it.
2. **Cards on the server.** Hand-offs, approvals and permission prompts
   live in the engine's data, not its memory, so a restart can't strand
   them.
3. **Routines, listeners and channels** run on the brain. The computer is
   woken only for the steps that need it, whether the Mac is open or not.
   The runner's routine jobs become the brain's; mail from strangers
   follows decision 3.
4. **Files.** Every finished file is copied off the computer to the
   server automatically, so opening it never wakes the computer.
5. **The computer as hands only.** The engine is no longer started on the
   computer. The computer image keeps the exec daemon,
   Chrome, the screen and the files.

## Decisions (taken 4 November 2026; the founder may overrule)

1. **Where it runs:** a Render service, one engine process per person. Today
   that is one process.
2. **The browser in the app** (`docs/app-browser/`): off while this is
   built, with the code kept. Websites go back to the computer's Chrome.
3. **Mail and messages from strangers:** the runner's no-tools rule stays.
4. **A routine that only uses connectors** runs on the server and never
   wakes the computer.

## What is not known yet

- How much the engine depends on being inside the computer. Step 0 answers
  it.
- The cost of an always-on engine per person.
- How long a step takes through the proxy, compared with inside the
  computer.
