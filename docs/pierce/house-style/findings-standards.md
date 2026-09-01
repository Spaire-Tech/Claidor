# Open standards for findings

You asked whether anyone has already solved "how should a finding be written". Two groups have, and both are open. Neither is about spreadsheets. Both are about exactly your problem: a machine found something, and now it has to tell a person.

Downloaded and read directly on 31 Aug 2026. Not summarised from a blog.

---

## 1. SARIF — the shape of a finding

SARIF is the OASIS standard for how any code-checking tool reports what it found. GitHub, Microsoft, and most security scanners speak it. The schema is a JSON file on GitHub.

I downloaded the schema (112 KB) and read the fields. Four of them solve problems you already have.

### `message` — the rule you worked out yourself

The schema says, in its own words:

> The first sentence of the message only will be displayed when visible space is limited.

That is your "first view" problem, written into a standard. The first sentence has to stand alone. Everything after it is optional detail. You reached the same conclusion by looking at your own report and disliking it.

### `kind` — the honest way to say "I don't know"

Every finding carries one of these values:

`notApplicable` · `pass` · `fail` · `review` · `open` · `informational`

**`review`** means the tool found something but cannot decide, so a person must look.
**`open`** means unresolved.

This is your abstain rule, already a standard value. Module1 was never a `fail`. It was `review`. You would not have needed to invent a consequence for it, because the format has a slot for "found it, could not judge it".

### `baselineState` — your version Watch

`new` · `unchanged` · `updated` · `absent`

The standard already has the vocabulary for "this defect was not here in the last version". That is the thing you sell. You do not need to design that language.

### `partialFingerprints` — the fix for your severity problem

A stable identity for a finding that survives across runs, even when the file moves around it.

This fixes two things at once. Your identical hardcode reading `Observation` in one run and `Significant` in the next means the finding has no stable identity. And a fingerprint that survives an inserted row is the same problem as your shift-aware version diff. One mechanism, two wins.

**Levels** are `none` · `note` · `warning` · `error`. Four, not your three. Worth comparing against Material / Significant / Observation.

**Licence**: OASIS standard, RF on RAND terms. Free to implement. The schema is on GitHub at `oasis-tcs/sarif-spec`.

**What to do with it**: emit SARIF as an export format alongside your own report. It costs little, and it means a bank's existing tooling can read your output on day one.

---

## 2. The Rust compiler — the wording of a finding

Rust is known for having the best error messages in software. Their rules are written down in the compiler dev guide, licensed MIT and Apache 2.0. I cloned it and read the style section.

Their bar, in their own words:

> Write in plain simple English. If your message, when shown on a — possibly small — screen (which hasn't been cleaned for a while), cannot be understood by a normal programmer, who just came out of bed after a night partying, it's too complex.

That is a better version of the bar I gave you. Same idea, easier to hold in your head.

The rest of their list, and what each one means for you:

| Rust rule | For Swens |
|---|---|
| The message should stand on its own, so it makes sense in isolation | Same as SARIF's first sentence. Two independent groups, same conclusion. |
| Messages should be succinct — users see them many times | Your reviewer sees eighteen of them per model. |
| "The word illegal is illegal." Prefer a specific word | Your version: "material", "observation", "departure" are vague. Say what happened. |
| Try not to emit multiple messages for the same error | **This is your one-authoring-situation-one-finding rule.** You arrived at it independently from the Ofwat flood. The Rust team wrote the same rule for the same reason. |
| Reduce the span to the smallest amount that still signifies the issue | Point at the cell that is wrong, not the whole block. |
| Care should be taken to avoid warning fatigue and false positives | Your quiet-report discipline, in their words. |
| Call it "the compiler", not "rustc" | Your machine-voice problem. Decide what the agent calls itself and never mention its parts. |

### Their four levels of confidence in a fix

This is the piece worth stealing outright. When Rust suggests a correction, it tags how sure it is:

- **`MachineApplicable`** — can be applied automatically
- **`HasPlaceholders`** — has gaps a person must fill
- **`MaybeIncorrect`** — might be wrong
- **`Unspecified`** — we don't know

You already split corrections into determined and inferred. That is two levels. Rust runs four, and the middle two are the useful ones you're missing. `HasPlaceholders` fits a repair where you know the shape but not a value. `MaybeIncorrect` lets you offer a fix without pretending to be sure — which is how you propose a correction without breaking your independence rule.

---

## What I did not find

No open standard for **wording an audit finding in finance**. The internal-audit convention (criteria, condition, cause, effect, recommendation) is published in textbooks and by professional bodies, but it is not an open licensed document you can copy. If you want that structure, write it yourself from the shape.

So the honest answer: the software world has open standards for this and finance does not. That is a small argument for your company, not against it.

---

## The three things worth doing

1. **Adopt `kind: review`.** One field, and it makes "I found it but did not judge it" a first-class state instead of a sentence you have to write carefully. This is the Module1 fix.
2. **Adopt fingerprints.** Stable identity per finding. Fixes the severity flapping and feeds the version diff.
3. **Adopt the four applicability levels** for corrections instead of your two.

The full SARIF export is worth doing later. These three are worth doing now, whatever format you emit.
