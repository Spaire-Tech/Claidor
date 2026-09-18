# Running the eight: what the Chief of Staff session can actually do

18 September 2026. Written from a live check of this session's own tooling, not
from what ought to be possible.

---

## Yes, this is Grok-Bot-shaped, and it needs nothing installed

No Cowork. No new product. This session already holds the tools:

| Grok Bot | Here |
|---|---|
| `CreateAgent` | `create_session` — a real Claude Code session, its own container, its own clone of Claidor, its own branch |
| The agent's profile / brief | `append_system_prompt` on creation — this is where an agent's ownership rules go |
| `SendToAgent` | `SendMessage`, or `create_trigger` bound to that session |
| `[agent]` wake back to the CoS | `cross_session_inbound: available` on this session, and a `<child-session-event>` turn when a child's turn fails |
| Sidebar sections | `set_session_tags` / `set_session_title` |
| Watching work | `get_session` → `status_bucket`: working / blocked / review_ready / completed / failed |
| Stop, change of plan | `interrupt_session`, then steer with a message |
| Routines | `send_later` and `create_trigger` — the CoS schedules its own sweeps |
| — | `subscribe_pr_activity` — watch each agent's PR, handle CI |
| Retire an agent | `archive_session` |

Two environments exist and both are live: `env_01TvfGF2CvJEjAB2KT962RVR`
(Default) and `env_01QWy5TYEHiNu9ArMyS7dGkS` (Default — trusted network access).
The second matters for the Box agent, which has to reach E2B.

Children inherit this session's permission mode and can never exceed it. This
one is `auto`, which is what lets them work without stopping for approval on
every edit. **A child must never be created in `plan` mode** — it would block
forever waiting for a human who is not watching.

## The three real limits

**1. The Chief of Staff is not a daemon.** This session acts only when a turn
fires: the founder writes, a scheduled trigger fires, a PR event arrives, or a
child fails. Between those it is not running and not watching. Grok Bot's CoS has
the same shape, so this is not a defect — but it means supervision is a
**scheduled sweep**, not a live eye. A child that quietly goes wrong stays wrong
until the next sweep.

Mitigation: a check-in every hour or two that reads each child's `status_bucket`
and its branch, rather than trusting silence. Note that a child finishing
*cleanly* may not announce itself; only failures reliably do.

**2. Context is finite, and this session is 60% spent.** 607,856 of 1,000,000
tokens, after one day. Eight agents over weeks will not fit in one head.

This is why the documents in `docs/product/` matter more than they look. They are
the fleet's memory: a fresh Chief of Staff session reads `staffing.md`, the
audits and the decision records and is current in ten minutes. **The right move
is to start the fleet from a new CoS session, not this one**, and let this one
stand as the record of how the decisions were reached.

**3. Cost multiplies by the number of agents.** This session alone is
$100.54 so far, and the account is on a seven-day window currently reading
`allowed_warning`. Eight parallel sessions each doing real work is not eight
times a little. Start with two or three, prove the loop, then widen.

## What the founder does

Nothing technical. Four decisions and two inputs:

1. **Say go**, and how many to start with. The recommendation is **three**, not
   eight: Server (the image route), Brief (Task Zero, then the triage), and Box
   (the measurement). Those three share no files, need nothing from each other,
   and between them answer the two questions that could change everything else —
   whether the engine can drive a remote box, and whether the brief survives
   triage.
2. **Confirm children may push branches** but do not open pull requests
   unasked. This session carries `config:auto-create-pr:off`; children should
   match it, and the Chief of Staff opens one when a piece of work is actually
   done.
3. **The E2B key** into Render's environment, when Box gets past the
   measurement. Never into the repo, never into the app.
4. **Four drawings** — archive, video, audio, text — which unblock the second
   half of Files.

## How a sweep should go

Each check-in, for every live agent:

1. `get_session` — `status_bucket`, and whether the model drifted.
2. Its branch: has it pushed, and does the diff match what it was asked for?
3. Anything it reported, or a failure event.
4. Then one of: leave it alone, send one steering message, `interrupt_session`
   and re-brief, or archive it as done.

And the rule that keeps this honest, taken from the brief the agents themselves
read: **interrupt them for decisions, not for progress.** A sweep that sends
eight "how's it going" messages is eight interruptions and no information.
