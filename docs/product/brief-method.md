# How to audit a brief

19 September 2026.

This is the method that came out of triaging Caisra's managed brief, written so
it applies to any brief. It is being written down because the brief it was
developed against **no longer exists**: between 00:20 and 01:20 UTC the product
was re-founded on a source reconstruction of Grok Bot 0.18,
`openclawConfigSync.ts` and the fifteen modules extracted from it are gone, and
`briefConsistency.test.ts` has no subject. The method survived the file. That is
the only reason it was worth writing down.

The second half is a first read of the new brief against the method.

---

# Part 1 — The method

## The three tests, in the order they are cheap

### 1. The incident test

> **A rule keeps its place only if it can name the incident that produced it.**

In this repository the incidents are the 81 numbered items in
`docs/product/review.md`. Anywhere else it is whatever record exists of what
actually went wrong: a bug tracker, a support thread, a transcript the founder
pasted in anger.

A rule that cannot cite one is somebody's theory. The theories are what have
been wrong — every contradiction `docs/product/brief-audit.md` found was between
two rules, and in all four cases the one that lost was the one written from
reasoning.

**Run it as a search, not as a recollection.** For each section, search the
record for the vocabulary that section is about, and write down what you
searched. A "zero hits" claim is worth exactly as much as the search behind it,
which is why the searches are listed in `brief-triage.md` rather than
summarised. Two traps cost me a pass each:

- `grep -i TeX` matches inside the word *text*. Use case-sensitive or
  word-bounded patterns for short tokens.
- A `grep -E` pattern written with `\|` matches a literal pipe instead of
  alternating, and silently returns nothing for every term. A sweep that finds
  nothing anywhere is more likely a broken pattern than an empty record.

### 2. The behaviour-versus-fact test

The incident test alone deletes too much. The refinement:

> **Does this sentence change what the agent *does*, or is it a fact the agent
> needs to *know*?**

- **Behaviour** must cite an incident. "Prefer prose over bullets" is a theory
  until something went wrong because of bullets.
- **A fact** does not. "`web_search` is disabled in this workspace" cites
  nothing and must stay, because deleting it leaves an agent reaching for a tool
  that is not there.

Behaviour that duplicates another section goes. A fact that lives only here
stays, **even when the section around it is redundant** — which usually means
cutting the section down to its facts rather than deleting it.

Three sharp cases from the real pass:

- `## Heartbeat Policy` looked like it held a protocol fact — reply
  `HEARTBEAT_OK`. It did not: the engine injects that instruction itself on
  every poll. A fact the runtime already states at the moment it matters is not
  yours. **Check who else is already saying it.**
- `## Math Formula Formatting` was almost all behaviour and held exactly one
  fact (this app renders TeX with KaTeX; IM channels do not). I deleted it
  anyway and wrote down that I had, because a one-line fact is not worth a
  section and the cost of being wrong was small and visible. **Say when you
  overrule your own test.**
- `## Memory Policy` split cleanly: paths are facts, precedence is a real
  decision, and how to lay out a bullet in `MEMORY.md` is taste. The taste went.

### 3. The one-owner axis

From `brief-audit.md`: the brief contradicted itself four times, and every time
the wrong rule sat earlier in the file than the right one. The fix is not to
rewrite rules, it is to name the axes.

> **For each thing the agent has to decide, exactly one section decides it.
> Others may point at that section. None may restate it.**

Mechanically: a list of axes, each with an owning section and a set of phrasings
that count as *deciding*. A phrasing found outside the owner fails the check.

Four things this gets wrong if you are not careful, all learned by getting them
wrong:

1. **Key the deciders to the decision, never to the heading name.** A section
   that points at the owner quotes the owner's title — so a decider keyed to the
   title fires on every legitimate pointer. Key on `the job is on`, not on
   `### When they answer you`.
2. **A sub-heading of the owning section is not a rival.** If the splitter
   breaks on every heading, `### When to make one` reads as a separate section
   from the `## Documents You Make` it belongs to. Name the sub-headings in the
   owner pattern.
3. **The check must fail when nothing decides an axis**, not only when two
   things do. That is what caught the artifacts decision deleting both owners of
   "whether to do more than was asked" and leaving the axis undecided.
4. **Being inside the check's input is not the same as being checked.** The
   sharpest finding of the whole triage: `## Web Search` and `## Where To Look
   First` both decided where to look for a fact, both were already being read by
   the consistency test, and it passed them — because there was no axis for that
   decision. **An axis you have not named cannot fail.** When you delete a
   restatement, add the axis in the same commit, or it comes back.

## Two habits that are worth more than any single verdict

**Produce the list before deleting anything.** The verdicts are cheap to
generate and expensive to be wrong about. Writing them out first turns "I think
this section is junk" into a claim somebody else can check.

**Verify the provenance of the thing you are auditing before you audit it.** I
triaged the wrong brief for a full pass. My session had been cut from `main`
without the branch carrying the current decisions, so I measured a brief that
still contained a subsystem that had already been deleted. **8,948 characters of
finished analysis — about a fifth of the pass — described text that was not in
the product.** Nothing in the method catches that. The only thing that catches
it is checking, at the start, that the tree you are reading is the tree that
ships: what branch, what is unmerged, and what decision documents exist that you
have not read.

---

# Part 2 — A first read of Grok Bot's brief against the method

Read on 19 September from `origin/claude/caisra-mac-app-ouliez`. Measured, not
recalled.

## The size finding, and a correction to it

| | Characters |
|---|---|
| Their base prompt (`host/runner/system-prompt.ts`) | **69,217** |
| Their assembly (`host/runner/system-prompt-assembly.ts`) | 16,163 |
| Ours, at its largest | ~74,000 |
| Ours, after the triage | 40,434 |

**Their brief is 71% larger than ours, in the product the founder judged far
better.** So "the brief is too long" now has a number against it, and the number
says length was never the problem. This is the single most useful thing in this
read, and it should stop anyone reaching for deletion as a first instinct —
including anyone reading `brief-triage.md`, where the case for cutting is made
at length and the case rests on *contradiction*, not size.

**But the framing I was handed with it is wrong, and the correction matters.** I
was told they "assemble the brief from components per turn instead of
concatenating one file", pointing at `packages/prompt-jsx`. That is not what
`prompt-jsx` does. It is 3 files, and `components.ts` in full is `System`,
`User`, `Assistant`, `Tool`, `Conversation`, `Fragment` — a renderer for
**message roles in a conversation**, not for brief sections. The brief assembler
is `system-prompt-assembly.ts`, which does not use it.

And their base prompt **is** one concatenated file: `buildSandBaseSystemPrompt`
is ~190 lines of string literals joined with `\n`, exactly the shape ours had.
It has zero markdown `##`-level sections addressed by any test.

So the real difference is narrower and more useful than "they assemble it".

## What they actually do: sections owned by the subsystem, included only when live

`getSystemPrompt()` is the base, plus roughly fourteen sections added through one
guard:

```
const add = (value) => { if (value != null && value.length > 0) sections.push(value); };
```

Each section is produced by a `render*SystemPrompt()` function that **lives in
the subsystem it describes** — `automations/automation.ts` renders the
automations section, `sand-memory.ts` the memory one, `channel-messaging.ts` the
channels one, `agent-messaging.ts` the agent directory, `timezone.ts` the time
zone. Each returns an empty string when it has nothing to say, and `add` drops
it. Several are additionally gated on the kind of runner
(`isSubagentRunner`, `isSharedRoomRunner`, `isBoxScopedSubagent`) or on a feature
flag.

Three consequences worth taking:

1. **An agent is never told about a subsystem that is not there.** No channels
   connected means no channels section — not a section saying none are
   connected. Our brief states rules about connectors, projects and other agents
   to every agent whether or not any exist.
2. **The rule ships with the state it governs.** The automations section renders
   the user's actual routines and their actual time zone next to the rules about
   scheduling. Ours states the rule and leaves the model to find the state.
3. **One subsystem, one owner, enforced by the file layout.** This is the
   one-owner axis, achieved structurally rather than by a test. The section about
   automations cannot drift from the automations code, because it is in it.

That last point is the strongest argument for the extraction I did, which is
otherwise lost with the tree: putting each part of the brief next to what it
describes is what stops two people deciding the same thing in two places.

## How they write a rule

The best example is the scheduling-window rule in
`host/automations/automation.ts`. Four paragraphs on one decision, and it makes
four distinct moves our rules almost never make:

1. **States the default as a default, in the literal syntax the model must
   emit** — `"15 8 * * 1-5"`, `"*/30 9-18 * * 1-5"` — not "prefer working
   hours".
2. **Names the half-measure failure mode**: *"Bounding one field and leaving the
   other open is the half-measure to avoid: an hour range with day-of-week `*`
   still runs all weekend, and weekdays with hour `*` still fires at 3am."* It
   anticipates the *almost*-right answer, which is the one a model actually
   produces.
3. **Names the misleading input and the mechanism that betrays it**: *"Check
   daily", "every day", "keep an eye on it"* are loose phrasing for "regularly",
   and `@daily` fires at midnight while `@every 30m` cannot be bounded at all.
4. **Lists the acceptable exceptions exhaustively, and one explicit
   non-exception**: *"a feed which keeps producing around the clock is NOT such
   a reason: what matters is when the user is there to act on it."*

A rule written this way cannot be satisfied by a plausible-looking wrong answer,
which is the failure mode of every rule we wrote as a sentiment. `brief-audit.md`
already identified this — *"rules are written as sentiment, not as a test the
model can apply"* — and named the fix. This is what the fix looks like at full
size.

## Where the incidents live, and this is the finding that reframes the triage

Ours and theirs both encode incidents. The difference is **who can read them**.

In our brief, an incident lives in a `//` comment above the constant:

```
// Whether to ask is decided in exactly one place... That is how the founder
// got "Assuming Tokyo as your base" instead of a question.
```

**The model never sees that.** It is a note to the next author. The rule that
reaches the model is the conclusion with the evidence stripped off.

In theirs, the incident is *in the prompt text*, as a Wrong/Right pair with the
literal strings in it:

> - Wrong: ending the turn with the plain text `Doing good, you?`. The user sees
>   silence and assumes you ignored them.
> - Right: `SendMessage({"type":"text","content":"Doing good, you?"})`. Even one
>   word of small talk goes through SendMessage.

Their base prompt contains 3 explicit Wrong/Right pairs and 12 parenthetical
quoted examples. Ours contains **zero** Wrong/Right pairs across every module.

We did do this in one place — `## What you are` ends by narrating the 16
September incident in full — and that is the section written most directly
against a founder complaint. It is the exception that shows the pattern.

**So the incident test has a second use nobody had noticed.** It has been a test
for whether a rule deserves to exist. It is also a test for whether a rule is
*written* well: if you can name the incident, you can write the Wrong line. A
rule whose incident you can name and which contains no example of the wrong
behaviour is a rule that threw away its best sentence.

## What ours should take, in order

1. **Stop treating length as the problem.** 69,217 against our 40,434, in the
   better product. Cut for contradiction, never for size.
2. **Write the Wrong line.** For every rule that cites an incident, put the
   failing behaviour in the prompt with the literal text, not in a comment.
   Cheapest change with the largest expected effect, and the incident triage has
   already produced the list of rules that qualify.
3. **Anticipate the almost-right answer.** Name the half-measure, as the
   scheduling rule does. A rule that only rules out the obviously wrong answer
   does not bind.
4. **Put each section next to the subsystem it describes, and let it return
   empty.** Structural one-ownership, and no agent told about a subsystem it
   does not have.
5. **Ship the rule with its state.** Render the actual routines, the actual
   connected services, the actual time zone beside the rules that govern them.
6. **Keep the axis check**, wherever the brief ends up. It is the only part of
   this that fails on the class rather than on one instance, and it caught a
   live contradiction that five tests reading the same text had missed.

## What I did not do

- **Nothing here was run.** No model has been given either brief under
  measurement. Every claim above is a reading, which is the same method that
  produced the contradictions in the first place. The Rakazo eval harness
  (`CLAUDE.md`) is the thing that would settle any of it and it has not been
  built. **Until it is, "their brief is better" remains the founder's judgement
  of a running product, not a measurement of a prompt**, and the 69,217 number
  says nothing about which parts of it are load-bearing.
- **I read four files of theirs**, not the tree: `system-prompt.ts`,
  `system-prompt-assembly.ts`, `automations/automation.ts`, and the three
  `prompt-jsx` files. I did not read `sand-memory.ts`, `channel-messaging.ts`,
  `agent-messaging.ts` or any other `render*SystemPrompt` body, so what I say
  about them is from their call sites and their names.
- **I did not check whether their brief contradicts itself.** Applying the axis
  check to 69,217 characters is the obvious next piece of work and it is not
  started. It is also the first real test of whether this method survives
  contact with a brief it was not developed on.
