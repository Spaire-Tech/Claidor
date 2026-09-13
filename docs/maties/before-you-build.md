# Before you build anything

September 12, 2026. The founder's instruction, in their words:

> we have a very complete code — before you touch anything, always ask
> yourself is this built already. always assume it did. we should never
> ever be lazy analysing the repo.

This note is the register that makes that possible. It is not a plan and
not an audit. It answers two questions:

1. **Does this already exist?** Assume yes until the repository says no.
2. **What will this change quietly break?**

Keep it current. Every time a session discovers something that was
already built, or a trap that cost real time, it belongs here. A fact
found twice is a note that was not written the first time.

---

## The rule, and why it has teeth

On 12 September the browser stopped working entirely — not the in-app
panel, *any* browsing. The cause was a change made the day before that
looked additive and safe: three extensions were taken off a deletion list
so a new feature could be built.

What that missed is in the very next paragraph of the file being edited.
The list exists because plugin discovery is expensive, yes — but the
engine also loads plugins **all-or-nothing**. One extension that cannot
load throws for the whole registry, and every other plugin dies with it.
One of the three had four dependencies our packaging never installs.

The reasoning written in that commit was: *"keeping them only makes that
possible"*. That was the error. Keeping an extension also makes it
possible for that extension to fail, and here one failure is total.

**So: before adding a name to any list, read what the list is protecting.**

---

## Traps, each one paid for

**Plugin loading is all-or-nothing.** `maybeThrowOnPluginLoadError` throws
for the entire registry if any single plugin is in an error state. Adding
or enabling a plugin risks every other plugin. Never enable one without
starting a gateway and seeing it listed as loaded rather than errored.

**Channels fail soft; plugins fail hard.** A channel whose setup entry
will not resolve is logged at warning level, skipped, and every other
channel carries on. That difference is why
`scripts/verify-openclaw-plugins.cjs` fails the build on a plugin and
only prints a warning for a channel.

**Telegram's setup entry does not load in the packaged runtime.** As of
13 September the built runtime prints `[channels] failed to load bundled
channel setup entry telegram: missing generated module`. The file it
wants, `setup-entry.js`, is right there in
`dist/extensions/telegram/`, so this is path resolution, not pruning.
The unpruned source build does not print it, and `desktop/` at this
commit is exactly upstream, so it is upstream's packaging and not ours.
Consequence: Telegram's *setup* flow is skipped. Not yet chased.

**`doctor`'s exit code is not a health signal.** It is
`exitCodeFromFindings`, and the severity floor defaults to `info`, so a
perfectly healthy runtime exits 1 — ours does, over optional skills with
missing binaries. Anything gating on `$?` from `openclaw doctor` is
wrong. Proof that doctor really ran is `checksRun` in its JSON.

**`plugins list --json` cannot report a broken plugin.** It reads
manifests and sets `status: enabled ? "loaded" : "disabled"`
(`src/plugins/status-snapshot.ts`); it never imports anything. Pointed
at a runtime with a deliberately broken extension it reported 24
plugins, none in error. Use `doctor --lint`, which performs a real load.

**`plugins.allow` is a strict allowlist once non-empty.** A bundled
plugin missing from it never loads and nothing says so. This has bitten
twice: the search provider, and the wiki.

**Config that names a plugin the runtime does not have is rejected.**
Which is why every plugin entry is guarded by
`hasRuntimeBundledOpenClawExtension`. The pruning list and the config
generator must agree, and they are in different files.

**The generated config is validated as one strict schema.** A stray key
in a plugin entry does not fail that plugin; it fails the whole config
file. Plugin settings go under the entry's `config` key.

**The gateway binds some config once, at startup.** The browser profile
is one. Writing a corrected value to disk is not enough — the running
gateway keeps what it booted with unless the sync asks for a restart, and
only `mcp` and the browser profile currently do. Symptom: the file on
disk and the app's behaviour disagree and both are telling the truth.

**Config sync runs before the MCP bridge has a port.** Anything depending
on that bridge is unavailable on the first sync of every launch. Fall
backs here must be visible, never silent.

**Silent fallbacks are the recurring shape of every one of these bugs.**
A warning in a log file nobody opens is not telling anyone. If a feature
cannot do what its setting says, say so on screen.

**The desktop composer is rendered by two different components** —
`CoworkView` on the home screen, `CoworkSessionDetail` inside a
conversation. Going from home into a chat unmounts one and mounts the
other. Any state that must survive that moment cannot live in a ref
inside the composer.

**Server tests need Python 3.14 final**, not a release candidate. Pure
modules still run with `pytest --noconftest`.

**`npm rebuild better-sqlite3`** after `compile:electron`, or vitest
cannot open the database.

---

## Already built — check here before writing it again

**The engine ships far more than we surface.** `docs/maties/engine-audit.md`
is the full inventory as of 11 September: 97 add-ons reach our build and
our list keeps 25. Read it before building any capability that sounds
like something an agent framework would already have.

Specifically present and easy to miss:

- **A memory wiki** — pages of claims with confidence, provenance,
  contradictions and open questions, with managed blocks so human notes
  survive. Currently switched off (see the traps above).
- **Telephony** — inbound and outbound calls over Telnyx, Twilio or
  Plivo, caller allowlist, per-phone session memory, realtime
  voice-to-voice. Pruned; needs its dependencies installed first.
- **iMessage** — a real channel reading the Mac's own Messages database
  through the `imsg` CLI. macOS only. Pruned.
- **ElevenLabs as a speech provider** inside the engine. Pruned. Note the
  app's own voice does **not** use it — see below.
- **A browser the agent drives**, with an in-app mode that renders into
  the app's own panel through an MCP bridge.

**Ours, already written, do not rebuild:**

- **The voice** — `server/polar/desktop/speech.py` and
  `desktop/src/main/libs/speech/`. The app holds no key; it asks Claidor,
  Claidor holds the ElevenLabs key. The engine is not involved.
- **The metered model proxy** — `server/polar/desktop/`. Two providers,
  one price list, credits per month. Anything that costs money per call
  should meter through this, in the same credit unit.
- **The loopback token proxy** — `desktop/src/main/libs/openclawTokenProxy.ts`.
  The pattern for letting the engine reach a Claidor route without ever
  holding a credential. Connections and the voice both use it. Use it
  again rather than passing a token into the engine, which expires inside
  it and dies quietly.
- **Connections** — `server/polar/connectors/`, 65 services through a
  middleman.
- **The cloud runner** — `runner/`. Note its shape before assuming it can
  host anything: it is a Render **worker** with no public address, takes
  one job at a time, and deletes everything after. It cannot receive a
  webhook or hold a phone call.
- **Shared memory across machines** — `server/polar/desktop/memory_merge.py`
  and `desktop/src/main/libs/memorySync/`.
- **Onboarding**, six screens, `desktop/src/renderer/components/onboarding/`.

---

## How to check, in order

1. `docs/maties/plan.md` — the plan of record. It may already decide the
   question, including where a key is allowed to live.
2. This note, and `docs/maties/engine-audit.md`.
3. The repository itself: `rg` for the feature's nouns, in
   `server/polar/`, `desktop/src/`, `runner/src/`, and the engine's
   `openclaw/extensions/`.
4. Only then write anything.
