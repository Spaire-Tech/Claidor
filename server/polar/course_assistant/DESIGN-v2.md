# Course Assistant — v2 design decisions

**Status: rework in progress.** The creator-facing v1 console (the "Assistant"
editor tab, approval-gated, transcript-gated) has been **removed from the UI**
and replaced with a per-course toggle in **course Settings**. The student chat
widget in the portal (`AskAssistant`) stays behind `COURSE_ASSISTANT_UI_ENABLED`
(`clients/apps/web/src/components/Courses/assistant/flag.ts`) until the reworked
v2 chat UI lands. The old `AssistantPanel` is unreferenced but kept in-tree.
This note captures the agreed v2 direction so the decisions aren't relitigated.

## Confirmed decisions (2026-06-26)

These were locked in with the user and are now partially implemented:

1. **Default ON.** New courses get the assistant automatically
   (`Course.assistant_enabled` defaults `true`, server_default `true`; the
   existing rows backfill ON via the migration). ✅ implemented.
2. **Strictness surfaced in Settings, not buried.** The toggle lives in course
   Settings; when enabled, a two-option choice appears
   (`course_plus_general` default / `course_only`). Stored on
   `Course.assistant_strictness`. ✅ implemented (model + schema + Settings UI).
3. **Drop "What students are asking" (Phase 5) for v2.** The
   `course_assistant_questions` table + migration stay in-tree (no destructive
   drop), but no creator-facing analytics surface ships in v2.
4. **Remove the transcription UI entirely.** No per-lesson transcript badges or
   rows in the outline / lesson editor. Transcription remains invisible
   background enrichment for the answer model. ✅ implemented (badges removed
   from `OutlineTab`, `LessonEditorV2`, dead `ModuleCard`; `transcriptStatus.ts`
   deleted; the `transcript_status` field + refetch polling stay).

### Landed (stateless v2 engine)

- **Portal chat** rebuilt to the supplied design as the neutral "Course TA"
  (sparkle mark, course-first citations, labeled general knowledge, trust card,
  dark mode). ✅
- **Stateless `ask`**: `get_live_snapshot` assembles the knowledge base from the
  live course on every ask (no approval/snapshot), gated on `assistant_enabled`
  + enrollment. `live_answer_event_stream` uses a new neutral system prompt
  (`build_system_blocks_v2`) with the authority hierarchy, grounding-scaled
  confidence, and strictness; prompt caching on the course block is kept.
  Emits a `general` event when general knowledge was used. ✅
- **Status** simplified to "available = configured + enabled + enrolled", with
  Course TA labels + starters + suggestions + strictness. ✅

- **Lesson-mapped citations**: ✅ the assembler records per-lesson char ranges
  (`assemble_knowledge_base_with_refs`); `map_citations_to_lessons` turns each
  Anthropic document citation into a clickable "Lesson N · Title" card with the
  lesson thumbnail and a jump target. (Per-second deep-link timestamps would
  need timestamped transcript storage — a later refinement; cards open the
  lesson today.)
- **Follow-up generation**: ✅ `generate_followups` (cheap guardrail model) runs
  after each answer and emits the `follow` event; the UI renders the chips.

- **Per-second citation timestamps**: ✅ captions are now stored as timestamped
  cues (`course_lessons.transcript_cues`, migration `ca_cues_627`);
  `cue_seconds_for_text` locates the quote in the cues, citations carry
  `seconds`, and the portal deep-links `?lesson=<id>&t=<sec>` — `HlsVideo`
  seeks there (auto-starting the lesson). Existing transcripts backfill cues on
  the next (re)fetch; until then a citation opens the lesson at the start.
- **Live**: ✅ `COURSE_ASSISTANT_UI_ENABLED` is on.

### Still to build

- **Delete v1** (approval/snapshot/voice/state-machine, sample-QA, preview) once
  v2 is confirmed in production — currently retained, just unsurfaced.
- **Backfill cues** for already-transcribed lessons (re-run the transcript
  fetch) so older videos get clickable timestamps too.

> Note: the backend changes are static-checked (ruff/mypy clean on the touched
> files) but NOT runtime-verified — the Py3.14 pydantic-settings crash blocks
> pytest/alembic locally. Smoke-test the `ask`/status endpoints after deploy.

## What v2 is

A course **teaching assistant (TA)** — *not* an AI clone of the instructor.

- **Source priority:** the course first; Claude's general subject knowledge as
  *labeled* backup. Claude is strong on most course subjects; refusing anything
  outside the literal transcript made v1 feel broken.
- **Persona:** neutral "Course Assistant." No voice cloning.
- **No approval gate. No transcript gate. Live immediately.**

## Core decisions

1. **Course-first, general-knowledge-as-backup, transparent which is which.**
   Answer from the course when it covers the question; otherwise general
   knowledge, said plainly ("the course doesn't cover this directly, but
   generally…"), and **never contradict/override what the course teaches.**
2. **TA persona — drop the voice card entirely.**
3. **Stateless.** No draft/serving snapshot, no `building/ready_for_review/live`
   state machine.
4. **Instant grounding from course metadata** — title, module names, lesson
   titles + descriptions, and any text lessons are available with zero Mux
   involvement. Transcripts are **silent enrichment, non-blocking.**
5. **Enrollment-gated for students** (unchanged); customer + member sessions.

## Two refinements (must-haves, not optional)

**A. Confidence scales with grounding — the day-zero paradox.**
On day zero the TA has metadata only, so it's *least* grounded exactly when it
launches — most likely to give the generic textbook answer that undercuts an
opinionated creator. The risk and the launch stack on the same day. Fix is
prompt-shaping, not infrastructure:
- *Metadata-only:* hedge, stay scoped, route to the relevant module ("the course
  covers this in Module 3 — want me to point you there?"). Do **not** answer
  substantively on *method*.
- *Once transcripts land* (it knows the instructor's actual position): answer
  with more authority.

**B. Strictness default must not be opt-in-by-spelunking.**
The creators who most need "course-only" strictness (proprietary, opinionated,
premium) are the least likely to find a buried toggle and the angriest if the TA
goes off-script. Fix: surface the choice in the **setup flow** as a one-tap
question ("Does your course teach a specific method the assistant should stick
to?") **or** infer a sensible default from course type. Protection is not
opt-in-by-hunting.

## Trust signal

Cite "from Lesson 3" for course-grounded answers; **no citation** for general
knowledge. Doubles as a visual cue of which mode the TA is in.

## Cost: stateless ≠ uncached

Going stateless kills the snapshot state machine — but **keep prompt caching**
on the course-context block (`cache_control: ephemeral`). Otherwise we pay full
input for the whole course on every message. It's an optimization, not a
snapshot; it reintroduces none of the approval complexity. Design it in from the
start, don't retrofit.

## What v2 deletes from v1

- Voice-card generation.
- Approval endpoint + draft/serving snapshot columns + status state machine.
- Sample-Q&A review screen.
- Transcript-as-hard-gate (the pipeline stays, as enrichment only).

## What v2 keeps

- Enrollment gate; SSE streaming; the cheap input guardrail (but now permissive
  — general knowledge is allowed); customer + member auth; the transcription
  pipeline (now non-blocking, fetched inline on the API path).
- The "what students are asking" insight surface is orthogonal — probably keep.

## Open / deferred

- Exact setup-flow UX for the strictness question (one-tap vs inferred).
- Per-task model choice (answers vs guardrail).
- Whether general-knowledge answers should still be lightly logged for the
  insight surface.

## How to re-enable

Flip `COURSE_ASSISTANT_UI_ENABLED` to `true`, then **build v2 fresh as a clean
stateless service** — do not patch v1. v1's complexity is the thing v2 exists to
remove.

## Training vs context (and verified caching facts)

There is **no training / fine-tuning** in this build and there shouldn't be.
The TA is a stock Claude model with the course in its prompt — "open book," not
"crammed." When the creator edits a lesson, the prompt changes; nothing is
re-trained. v1 already works this way (`ai.py` sends the course as a `document`
content block). "Maximum context" = what we put in the prompt, not a training
step.

Each answer is one bundle: **system prompt (rules/authority hierarchy)** →
**course block (metadata day-zero, transcripts appended as they process)** →
**conversation (question + history)**.

**Prompt caching is the cost lever — design it in from day one.** Verified facts
for Claude (re-check at build time, but these are current):

- It's a flag: `cache_control: {type: "ephemeral"}` on the course block — not
  infrastructure.
- Cache **reads ≈ 0.1×** input price; **writes ≈ 1.25×** (5-min TTL) or **2×**
  (1-hour TTL). Pays for itself on the 2nd message (5-min) / 3rd (1-hour).
- TTL default **5 min**, refreshed on hit; use `ttl: "1h"` for bursty/idle
  courses.
- Minimum cacheable prefix ≈ **2,048 tokens** on Sonnet 4.6 (the answer model);
  smaller blocks silently don't cache — fine, they're cheap.
- **Prefix match:** everything before the breakpoint must be byte-identical
  every call. Order must be **stable course block → breakpoint → volatile
  question/history**. Never put a timestamp/question inside the cached block.
- Verify with `usage.cache_read_input_tokens` (0 across repeats = a silent
  invalidator).

Retrieval (vector DB) is the *only* thing that replaces "send the whole course"
— and only once course size forces it. Tabled for v1, correctly. Structure
(clear lesson boundaries, the instructor's framework stated plainly) grounds the
TA better than raw transcript volume.

