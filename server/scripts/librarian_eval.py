"""Graded librarian eval — three numbers, archived runs, diff vs previous.

Usage: ``CLAIDOR_ENV=development uv run task librarian_eval``

Scores (per docs/librarian-hardening-plan.md §3):
1. citation_precision — share of citations whose quoted source supports the
   claim they're attached to (judged by a model against the quote + claim
   context; the quote itself comes from the corpus, so the judge only
   assesses support, never facts).
2. trap_refusal — share of out-of-slice traps refused. ANY citation emitted
   on a trap is a fabricated-authority event and fails the whole run (hard
   fail, not a deduction).
3. version_accuracy — version-dependent questions: right regime picked
   (versions_used) or clarification correctly requested.

Strictly separate from pytest: legal accuracy and software correctness are
different numbers and are never reported together.
"""

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog

from polar.config import settings
from polar.kit.db.postgres import create_async_sessionmaker
from polar.librarian.service import librarian
from polar.postgres import create_async_engine

log = structlog.get_logger()

EVALS_DIR = Path(__file__).parent.parent / "evals"
RUNS_DIR = EVALS_DIR / "runs"
JUDGE_MODEL = "claude-sonnet-4-6"


async def collect(question: str) -> dict[str, Any]:
    engine = create_async_engine("script")
    sm = create_async_sessionmaker(engine)
    out: dict[str, Any] = {
        "text": "",
        "citations": [],
        "clarified": False,
        "versions_used": [],
        "authority": None,
        "error": None,
    }
    async with sm() as s:
        async for e in librarian.answer_stream(s, question):
            if e["type"] == "text":
                out["text"] += e["delta"]
            elif e["type"] == "citation":
                out["citations"].append({**e, "claim_context": out["text"][-400:]})
            elif e["type"] == "clarification":
                out["clarified"] = True
            elif e["type"] == "authority":
                out["authority"] = {"label": e["label"], "count": e["count"]}
            elif e["type"] == "done":
                out["versions_used"] = e.get("versions_used", [])
            elif e["type"] == "error":
                out["error"] = e.get("message")
    await engine.dispose()
    return out


async def judge_citation(client: Any, citation: dict[str, Any]) -> bool:
    """Does the quoted source passage support the claim next to it?"""
    prompt = (
        "Tu évalues une citation juridique. Voici la fin du passage de la "
        "réponse où la citation est ancrée, puis l'extrait de la source "
        "cité. La citation est CORRECTE si l'extrait soutient réellement "
        "l'affirmation juridique du passage (même partiellement), INCORRECTE "
        "si l'extrait est hors sujet ou contredit le passage.\n\n"
        f"PASSAGE (fin) : …{citation['claim_context']}\n\n"
        f"SOURCE ({citation['title']}) : « {citation['quote']} »\n\n"
        'Réponds UNIQUEMENT par un mot : "CORRECTE" ou "INCORRECTE".'
    )
    response = await client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=8,
        messages=[{"role": "user", "content": prompt}],
    )
    verdict = "".join(b.text for b in response.content if b.type == "text")
    return "INCORRECTE" not in verdict.upper()


def cited_numbers(citations: list[dict[str, Any]]) -> set[str]:
    """'AUPSRVE (1998) — Article 170' → {'170', '1998:170'}."""
    out: set[str] = set()
    for c in citations:
        title = c.get("title") or ""
        if "Article" in title:
            number = title.split("Article", 1)[1].strip()
            out.add(number)
            if "(1998)" in title:
                out.add(f"1998:{number}")
            if "(2023)" in title:
                out.add(f"2023:{number}")
    return out


async def run_eval() -> dict[str, Any]:
    import anthropic

    fixtures = json.loads((EVALS_DIR / "librarian_fixtures.json").read_text())[
        "fixtures"
    ]
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    results: list[dict[str, Any]] = []
    hard_fail = False
    for f in fixtures:
        r = await collect(f["question"])
        row: dict[str, Any] = {
            "id": f["id"],
            "category": f["category"],
            "n_citations": len(r["citations"]),
            "clarified": r["clarified"],
            "versions_used": r["versions_used"],
        }
        if f["category"] == "trap":
            row["refused"] = len(r["citations"]) == 0
            if not row["refused"]:
                hard_fail = True
                row["hard_fail"] = "citation émise sur une question piège"
        elif f["category"] == "version":
            expected = f["expected_regime"]
            if expected == "clarify":
                row["version_ok"] = r["clarified"]
            else:
                row["version_ok"] = (not r["clarified"]) and r["versions_used"] == [
                    expected
                ]
        if f["category"] in ("substantive", "version") and not r["clarified"]:
            judged = []
            for c in r["citations"]:
                judged.append(await judge_citation(client, c))
            row["citations_supported"] = sum(judged)
            must = set(f.get("must_cite", []))
            if must:
                row["anchor_hit"] = bool(must & cited_numbers(r["citations"]))
        results.append(row)
        log.info(
            "eval.fixture", **{k: v for k, v in row.items() if k != "id"}, id=f["id"]
        )

    judged_rows = [r for r in results if "citations_supported" in r]
    total_cit = sum(r["n_citations"] for r in judged_rows)
    supported = sum(r["citations_supported"] for r in judged_rows)
    traps = [r for r in results if r["category"] == "trap"]
    versions = [r for r in results if r["category"] == "version"]
    anchors = [r for r in results if "anchor_hit" in r]

    summary = {
        "ran_at": datetime.now(UTC).isoformat(),
        "citation_precision": round(supported / total_cit, 3) if total_cit else None,
        "trap_refusal": round(sum(1 for r in traps if r["refused"]) / len(traps), 3)
        if traps
        else None,
        "version_accuracy": round(
            sum(1 for r in versions if r.get("version_ok")) / len(versions), 3
        )
        if versions
        else None,
        "hard_fail": hard_fail,
        "auxiliary_anchor_recall": round(
            sum(1 for r in anchors if r["anchor_hit"]) / len(anchors), 3
        )
        if anchors
        else None,
        "n_fixtures": len(fixtures),
        "results": results,
    }
    return summary


def diff_previous(summary: dict[str, Any]) -> None:
    RUNS_DIR.mkdir(exist_ok=True)
    previous_files = sorted(RUNS_DIR.glob("*.json"))
    if previous_files:
        prev = json.loads(previous_files[-1].read_text())
        print("\n--- vs previous run", previous_files[-1].name, "---")
        for key in ("citation_precision", "trap_refusal", "version_accuracy"):
            a, b = prev.get(key), summary.get(key)
            delta = (
                f"{(b - a):+.3f}"
                if isinstance(a, float) and isinstance(b, float)
                else "n/a"
            )
            print(f"  {key}: {a} -> {b}  ({delta})")
    stamp = summary["ran_at"].replace(":", "-").split(".")[0]
    (RUNS_DIR / f"{stamp}.json").write_text(json.dumps(summary, indent=2))


async def main() -> None:
    summary = await run_eval()
    print("\n" + "=" * 56)
    print("LIBRARIAN EVAL —", summary["ran_at"])
    print("=" * 56)
    print(f"  citation_precision : {summary['citation_precision']}")
    print(f"  trap_refusal       : {summary['trap_refusal']}")
    print(f"  version_accuracy   : {summary['version_accuracy']}")
    print(f"  (aux) anchor_recall: {summary['auxiliary_anchor_recall']}")
    if summary["hard_fail"]:
        print("  *** HARD FAIL: fabricated citation on a trap question ***")
    diff_previous(summary)
    if summary["hard_fail"]:
        sys.exit(2)


if __name__ == "__main__":
    asyncio.run(main())
