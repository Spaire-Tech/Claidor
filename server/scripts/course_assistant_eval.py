"""Course Assistant — Phase 0 dogfooding & eval harness.

Exercises the "brain" (``polar.course_assistant.ai``) against a single course:
parses transcripts, assembles the knowledge base, builds the grounded /
voice-matched prompt, and (in ``--live`` mode) actually asks Claude the eval
questions and prints the answers + citations.

Modes
-----
    python scripts/course_assistant_eval.py --self-test
        Run assertions over the pure logic (no network, no DB, no API key).
        Exits non-zero on any failure. This is the offline correctness gate.

    python scripts/course_assistant_eval.py
        Offline dry run: build the knowledge base + prompt from the fixture
        course and print what *would* be sent, plus the eval set. No API calls.

    ANTHROPIC_API_KEY=... python scripts/course_assistant_eval.py --live
        Live: build the voice card + sample questions, then stream a grounded
        answer to every eval question and print answers, citations, and token
        usage. Add --question "..." to ask a single ad-hoc question.

This module imports only ``polar.course_assistant.ai`` (which is import-light),
so it runs even where the full app stack can't be imported.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

# Allow running both as `python scripts/course_assistant_eval.py` and as
# `python -m scripts.course_assistant_eval` by ensuring the project root
# (the parent of scripts/) is importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from polar.course_assistant import ai

DATA_DIR = Path(__file__).parent / "course_assistant_eval_data"
COURSE_TITLE = "Writing Short Fiction"
INSTRUCTOR_NAME = "Carla Marín"
DISPLAY_NAME = "Carla"
COURSE_SCOPE = "Craft of short fiction: premise, openings, and revising for tension."


def load_sources() -> list[ai.LessonSource]:
    """Build LessonSources from the fixture course (3 video + 1 text lesson)."""
    sources: list[ai.LessonSource] = []
    titles = {
        "lesson1.vtt": "Finding Your Premise",
        "lesson2.vtt": "Openings That Hook",
        "lesson3.vtt": "Revising for Tension",
    }
    for filename, title in titles.items():
        vtt = (DATA_DIR / filename).read_text(encoding="utf-8")
        transcript = ai.parse_vtt(vtt)
        sources.append(
            ai.build_lesson_source(
                lesson_id=filename,
                title=title,
                content_type="video",
                transcript=transcript,
            )
        )
    text_content = json.loads(
        (DATA_DIR / "lesson4_text.json").read_text(encoding="utf-8")
    )
    sources.append(
        ai.build_lesson_source(
            lesson_id="lesson4_text.json",
            title="Worksheet: The Want and the Wall",
            content_type="text",
            content=text_content,
        )
    )
    return sources


def load_eval_questions() -> list[dict[str, str]]:
    return json.loads((DATA_DIR / "eval_questions.json").read_text(encoding="utf-8"))


def build_prompt(
    sources: list[ai.LessonSource],
    voice_card: str | None,
    question: str,
) -> tuple[list[dict[str, object]], list[dict[str, object]], str]:
    knowledge_base = ai.assemble_knowledge_base(sources)
    system_blocks = ai.build_system_blocks(
        course_title=COURSE_TITLE,
        instructor_name=INSTRUCTOR_NAME,
        display_name=DISPLAY_NAME,
        voice_card=voice_card,
    )
    user_blocks = ai.build_user_blocks(
        knowledge_base=knowledge_base,
        question=question,
        course_title=COURSE_TITLE,
    )
    return system_blocks, user_blocks, knowledge_base


# --------------------------------------------------------------------------- #
# Self-test (offline correctness gate)
# --------------------------------------------------------------------------- #


def self_test() -> int:
    failures: list[str] = []

    def check(name: str, condition: bool) -> None:
        if condition:
            print(f"  PASS  {name}")
        else:
            print(f"  FAIL  {name}")
            failures.append(name)

    print("Self-test: transcript parsing")
    vtt = (DATA_DIR / "lesson1.vtt").read_text(encoding="utf-8")
    transcript = ai.parse_vtt(vtt)
    check("WEBVTT header stripped", "WEBVTT" not in transcript)
    check("timestamps stripped", "-->" not in transcript and "00:00" not in transcript)
    check("NOTE block stripped", "auto-generated transcript fixture" not in transcript)
    check(
        "voice tag <v Carla> stripped",
        "<v" not in transcript and "Carla>" not in transcript,
    )
    check("real content kept", "premise is the pressure" in transcript)
    check(
        "consecutive duplicate cue de-duplicated",
        transcript.count("It's the thing that won't let your character sit still") == 1,
    )

    print("Self-test: lesson content extraction")
    text_content = json.loads(
        (DATA_DIR / "lesson4_text.json").read_text(encoding="utf-8")
    )
    body = ai.lesson_text_from_content(text_content)
    check(
        "markdown body extracted",
        "The want and the wall" in body or "want" in body.lower(),
    )
    check("attachments excluded", "want-and-wall.pdf" not in body)
    check("captions flag excluded", "true" not in body.split())
    check("empty content -> empty string", ai.lesson_text_from_content(None) == "")
    check(
        "string content passthrough", ai.lesson_text_from_content("hello ") == "hello"
    )
    check(
        "blocks content joined",
        "a b"
        == ai.lesson_text_from_content({"blocks": [{"text": "a"}, {"text": "b"}]}),
    )

    print("Self-test: knowledge base assembly")
    sources = load_sources()
    kb = ai.assemble_knowledge_base(sources)
    check("all four lessons present", kb.count("[Lesson ") == 4)
    check("lesson titles labelled", "[Lesson 2: Openings That Hook]" in kb)
    check("tokens estimated > 0", ai.estimate_tokens(kb) > 0)

    print("Self-test: prompt construction")
    system_blocks, user_blocks, _ = build_prompt(
        sources, "Warm, blunt, uses analogies.", "Why is my opening flat?"
    )
    check(
        "one system block with cache_control",
        len(system_blocks) == 1 and "cache_control" in system_blocks[0],
    )
    sys_text = str(system_blocks[0]["text"])
    check("grounding instruction present", "ONLY from the course material" in sys_text)
    check("graceful-refusal instruction present", "doesn't cover that" in sys_text)
    check("disclaimer present", "AI version of the instructor" in sys_text)
    check("voice card injected", "uses analogies" in sys_text)
    check("user has document block first", user_blocks[0]["type"] == "document")
    check(
        "document has citations enabled",
        user_blocks[0]["citations"] == {"enabled": True},
    )
    check("document has cache_control", "cache_control" in user_blocks[0])
    check(
        "question is trailing text block (volatile suffix)",
        user_blocks[-1]["type"] == "text" and "cache_control" not in user_blocks[-1],
    )

    print("Self-test: guardrail parsing")
    check(
        "ALLOW parsed allowed", ai.parse_guardrail_text("ALLOW\nfine").allowed is True
    )
    check(
        "REFUSE parsed blocked",
        ai.parse_guardrail_text("REFUSE\nmedical advice").allowed is False,
    )
    check(
        "refuse reason captured",
        ai.parse_guardrail_text("REFUSE\nmedical advice").reason == "medical advice",
    )
    check(
        "ambiguous fails open", ai.parse_guardrail_text("hmm not sure").allowed is True
    )
    check("empty fails open", ai.parse_guardrail_text("").allowed is True)

    print("Self-test: sample-question JSON parsing")
    parsed = ai.parse_sample_questions(
        '```json\n[{"question":"Q1?","category":"core"},{"question":"Q2?","category":"out_of_scope"}]\n```'
    )
    check("fenced json parsed", len(parsed) == 2)
    check("category preserved", parsed[1].category == "out_of_scope")
    check(
        "bad category coerced to core",
        ai.parse_sample_questions('[{"question":"x","category":"weird"}]')[0].category
        == "core",
    )
    check("garbage -> empty list", ai.parse_sample_questions("not json at all") == [])
    check(
        "missing question skipped",
        ai.parse_sample_questions('[{"category":"core"}]') == [],
    )

    print("Self-test: citation extraction (duck-typed message)")

    class _Cite:
        cited_text = "premise is the pressure"
        document_title = "Writing Short Fiction"
        start_char_index = 10
        end_char_index = 40

    class _TextBlock:
        type = "text"
        citations = [_Cite()]

    class _Msg:
        content = [_TextBlock()]

    cites = ai.extract_citations(_Msg())
    check("one citation extracted", len(cites) == 1)
    check("cited_text carried", cites[0]["cited_text"] == "premise is the pressure")

    print()
    if failures:
        print(f"SELF-TEST FAILED: {len(failures)} assertion(s) failed: {failures}")
        return 1
    print("SELF-TEST PASSED: all assertions green.")
    return 0


# --------------------------------------------------------------------------- #
# Offline dry run
# --------------------------------------------------------------------------- #


def offline_report() -> int:
    sources = load_sources()
    kb = ai.assemble_knowledge_base(sources)
    system_blocks, user_blocks, _ = build_prompt(
        sources,
        voice_card="(voice card would be auto-extracted in --live mode)",
        question="My opening paragraph feels flat. Why?",
    )
    questions = load_eval_questions()

    print("=" * 72)
    print(f"COURSE: {COURSE_TITLE}  —  instructor: {INSTRUCTOR_NAME}")
    print("=" * 72)
    print(f"Lessons ingested: {len(sources)}")
    for i, s in enumerate(sources, 1):
        print(f"  Lesson {i}: {s.title}  [{s.content_type}]  ({len(s.text)} chars)")
    print()
    print(f"Knowledge base: {len(kb)} chars  (~{ai.estimate_tokens(kb)} tokens est.)")
    print()
    print("--- SYSTEM PROMPT (rendered) ---")
    print(str(system_blocks[0]["text"]))
    print()
    print("--- USER TURN STRUCTURE ---")
    print(
        f"  block 0: {user_blocks[0]['type']}  (course document, "
        f"citations={user_blocks[0].get('citations')}, cached)"
    )
    print(f"  block 1: {user_blocks[-1]['type']}  (question, volatile suffix)")
    print()
    print(f"--- EVAL SET ({len(questions)} questions) ---")
    by_cat: dict[str, int] = {}
    for q in questions:
        by_cat[q["category"]] = by_cat.get(q["category"], 0) + 1
    for cat, n in sorted(by_cat.items()):
        print(f"  {cat}: {n}")
    print()
    print(
        "Offline dry run only — set ANTHROPIC_API_KEY and pass --live to "
        "actually ask Claude."
    )
    return 0


# --------------------------------------------------------------------------- #
# Live mode
# --------------------------------------------------------------------------- #


async def live_run(single_question: str | None) -> int:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ANTHROPIC_API_KEY not set — cannot run --live.", file=sys.stderr)
        return 2

    sources = load_sources()
    kb = ai.assemble_knowledge_base(sources)

    # Build the voice card from the creator's own transcripts (self-serve step).
    transcript_sample = "\n\n".join(
        s.text for s in sources if s.content_type == "video"
    )
    print("Extracting voice card from transcripts...")
    voice_card = await ai.generate_voice_card(
        api_key=api_key,
        model=os.environ.get("COURSE_ASSISTANT_BUILD_MODEL", "claude-sonnet-4-6"),
        transcript_sample=transcript_sample,
        instructor_name=INSTRUCTOR_NAME,
    )
    print("--- VOICE CARD ---")
    print(voice_card)
    print()

    print("Generating sample review questions...")
    samples = await ai.generate_sample_questions(
        api_key=api_key,
        model=os.environ.get("COURSE_ASSISTANT_BUILD_MODEL", "claude-sonnet-4-6"),
        knowledge_base=kb,
        course_title=COURSE_TITLE,
    )
    for s in samples:
        print(f"  [{s.category}] {s.question}")
    print()

    answer_model = os.environ.get("COURSE_ASSISTANT_ANSWER_MODEL", "claude-sonnet-4-6")
    questions = (
        [{"question": single_question, "category": "ad-hoc"}]
        if single_question
        else load_eval_questions()
    )

    for q in questions:
        question = q["question"]
        print("=" * 72)
        print(f"[{q['category']}] Q: {question}")
        system_blocks, user_blocks, _ = build_prompt(sources, voice_card, question)
        print("A: ", end="", flush=True)
        citations: list[dict[str, object]] = []
        async for event in ai.stream_answer(
            api_key=api_key,
            model=answer_model,
            system_blocks=system_blocks,
            user_blocks=user_blocks,
            max_tokens=600,
        ):
            if event["type"] == "text":
                print(event["text"], end="", flush=True)
            elif event["type"] == "citations":
                citations = event["citations"]
            elif event["type"] == "error":
                print(f"\n  [error: {event.get('message')}]", end="")
        print()
        if citations:
            print(
                f"  citations: {len(citations)} -> "
                + "; ".join(str(c.get("cited_text"))[:60] for c in citations[:3])
            )
        print()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Course Assistant Phase 0 eval")
    parser.add_argument(
        "--self-test", action="store_true", help="run offline assertions"
    )
    parser.add_argument(
        "--live", action="store_true", help="call Claude (needs ANTHROPIC_API_KEY)"
    )
    parser.add_argument(
        "--question", type=str, default=None, help="ask a single question (live)"
    )
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    if args.live:
        return asyncio.run(live_run(args.question))
    return offline_report()


if __name__ == "__main__":
    raise SystemExit(main())
