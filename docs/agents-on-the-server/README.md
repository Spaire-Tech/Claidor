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

- **The person's data is copied, never moved, until it is checked.** The
  computer's engine stays as it is until the new one has served the founder
  for a while. Turning it back is one switch.
- **One person first, behind a switch:** the founder. Nobody else's agents
  change until the founder says so.
- **Every step logs what it decided.** That way nobody has to guess from
  outside, as on 4 November. Each step is checked on the founder's Mac before
  the next one, by sending a message, using a connector, opening a website and
  running a routine.

## The order of work

0. **Prove it (no change for anyone).** Run the engine outside a computer,
   here and against a stand-in computer, then against the founder's
   computer through the proxy. Measure:
   - which of the five `SAND_HOST_IN_BOX` places, and which paths that
     assume `/home/box`, break;
   - whether commands, files and the browser driver work over the network,
     and how slowly;
   - the engine's memory and CPU at rest and during a turn.

   This gives the real cost and the list of changes.
1. **The brain service.** One engine for the founder, on Render, with the
   founder's data copied from their computer's backup. The proxy sends
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
4. **Files.** What an agent makes is also kept on the server, so it opens
   in the chat while the computer sleeps.
5. **Everyone, then the computer as hands only.** The engine is no longer
   started on the computer. The computer image keeps the exec daemon,
   Chrome, the screen and the files.

## Decisions for the founder

1. **Where the brain runs:** a Render service, one process per person
   (recommended), or one shared process for everyone (cheaper, a large
   rewrite).
2. **The browser in the app** (`docs/app-browser/`): switched off while
   this is built, with the code kept (recommended). Websites go back to the
   computer's Chrome, as asked on 4 November.
3. **Mail and messages from strangers:** keep the runner's no-tools rule
   for them (recommended), or let the brain handle them with its tools.
4. **A routine that only uses connectors** ("every morning, read my email
   and post a summary in Slack"):
   - (a) runs on the server and never wakes the computer, which follows
     the rule "the computer when a connector can't do it" (recommended);
   - (b) runs on the computer, like every routine.

## What is not known yet

- How much the engine depends on being inside the computer. Step 0 answers
  it.
- The cost of an always-on engine per person.
- How long a step takes through the proxy, compared with inside the
  computer.
