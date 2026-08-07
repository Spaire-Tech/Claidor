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
4. conclusion_correctness — does the answer reach the RIGHT conclusion.
   A perfectly grounded answer can still be wrong: three production
   answers computed the art. 170 deadline one day short while citing the
   precedent that shows the correct count, and citation_precision saw
   nothing. Checked deterministically first (the expected date or figure
   must appear, the wrong one must not), then by a judge on the substance.
5. empty_citation_rate — citations whose quote supports no proposition at
   all (a procedural header like « Sur le moyen unique… »). Distinct from
   an unsupported claim: the quote is real, verified, and says nothing.

Strictly separate from pytest: legal accuracy and software correctness are
different numbers and are never reported together.
"""

import asyncio
import json
import os
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

#: Cap on the opening paragraph when an answer has no paragraph break at
#: all — the conclusion is never further in than this.
LEAD_CHARS = 400


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


async def judge_citation(client: Any, citation: dict[str, Any]) -> str:
    """Does the quoted passage support the claim — or say nothing at all?

    Three verdicts, because two different failures hide behind one word.
    A quote can be off-topic (SANS_RAPPORT), or it can be a procedural
    header that is perfectly real and supports no legal proposition
    whatsoever (VIDE) — an answer once cited « Sur le moyen unique… » as
    authority. Only SOUTIENT counts towards precision.
    """
    prompt = (
        "Tu évalues une citation juridique. Voici la fin du passage de la "
        "réponse où la citation est ancrée, puis l'extrait de la source "
        "cité. Réponds par UN SEUL MOT :\n"
        "- SOUTIENT : l'extrait soutient réellement l'affirmation juridique "
        "du passage (même partiellement).\n"
        "- VIDE : l'extrait est une formule de procédure ou d'en-tête "
        "(« Sur le moyen unique », « Attendu qu'il résulte des pièces du "
        "dossier », intitulé, numéro d'arrêt) qui n'énonce aucune règle ni "
        "aucune solution — il ne peut soutenir aucune affirmation.\n"
        "- SANS_RAPPORT : l'extrait énonce quelque chose, mais hors sujet "
        "ou contraire au passage.\n\n"
        f"PASSAGE (fin) : …{citation['claim_context']}\n\n"
        f"SOURCE ({citation['title']}) : « {citation['quote']} »\n\n"
        "Un mot :"
    )
    response = await client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=8,
        messages=[{"role": "user", "content": prompt}],
    )
    verdict = "".join(b.text for b in response.content if b.type == "text").upper()
    if "VIDE" in verdict:
        return "empty"
    if "SANS_RAPPORT" in verdict or "SANS RAPPORT" in verdict:
        return "unrelated"
    return "supported"


def check_conclusion_literally(text: str, conclusion: dict[str, Any]) -> list[str]:
    """Deterministic conclusion checks; returns the failures, if any.

    Dates and figures are checked in code, not by a judge: « le 13 février »
    versus « le 14 février » is exactly the error a model reader waves
    through, and it is the one that ends a client's case.
    """
    haystack = " ".join(text.split()).lower()
    # Forbidden values are checked against the opening paragraph only. The
    # answer contract puts the conclusion there, while a correct derivation
    # legitimately passes through the intermediate quantième (13/02 on the
    # way to a 14/02 deadline) in a later block. Forbidding a value
    # everywhere would fail the right answer for showing its work.
    lead = " ".join(text.split("\n\n")[0].split()).lower()[:LEAD_CHARS]
    failures: list[str] = []
    for group in conclusion.get("must_contain", []):
        variants = [group] if isinstance(group, str) else group
        if not any(v.lower() in haystack for v in variants):
            failures.append("manque : " + " | ".join(variants))
    for forbidden in conclusion.get("must_not_contain", []):
        if forbidden.lower() in lead:
            failures.append("conclusion erronée : " + forbidden)
    return failures


async def judge_conclusion(client: Any, fixture: dict[str, Any], text: str) -> bool:
    """Does the answer actually reach the expected conclusion?"""
    prompt = (
        "Tu compares la conclusion d'une réponse juridique à la conclusion "
        "attendue. Ignore le style, la longueur et les citations : seule "
        "compte la solution retenue.\n\n"
        f"QUESTION : {fixture['question']}\n\n"
        f"CONCLUSION ATTENDUE : {fixture['conclusion']['statement']}\n\n"
        f"RÉPONSE À ÉVALUER :\n{text[:2500]}\n\n"
        "La réponse retient-elle la même solution que la conclusion "
        'attendue ? Réponds UNIQUEMENT par "OUI" ou "NON".'
    )
    response = await client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=8,
        messages=[{"role": "user", "content": prompt}],
    )
    verdict = "".join(b.text for b in response.content if b.type == "text").upper()
    return "NON" not in verdict


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
    # Iterating on one failing fixture should not cost a full run.
    only = os.environ.get("CLAIDOR_EVAL_ONLY")
    if only:
        wanted = {x.strip() for x in only.split(",") if x.strip()}
        fixtures = [f for f in fixtures if f["id"] in wanted]
        log.info("eval.subset", ids=sorted(f["id"] for f in fixtures))
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
        if f["category"] in ("substantive", "version", "dated") and not r["clarified"]:
            verdicts = []
            for c in r["citations"]:
                verdicts.append(await judge_citation(client, c))
            row["citations_supported"] = sum(1 for v in verdicts if v == "supported")
            row["citations_empty"] = sum(1 for v in verdicts if v == "empty")
            must = set(f.get("must_cite", []))
            if must:
                row["anchor_hit"] = bool(must & cited_numbers(r["citations"]))

            # The second dimension: is the CONCLUSION right? Literal checks
            # first — a wrong date is caught in code, not by a judge.
            conclusion = f.get("conclusion")
            if conclusion:
                failures = check_conclusion_literally(r["text"], conclusion)
                row["conclusion_failures"] = failures
                judged_ok = await judge_conclusion(client, f, r["text"])
                row["conclusion_judged"] = judged_ok
                row["conclusion_ok"] = (not failures) and judged_ok
        elif f.get("conclusion") and r["clarified"]:
            # A clarification is not a wrong conclusion, but it is not the
            # expected one either: scored as a miss, visibly.
            row["conclusion_ok"] = False
            row["conclusion_failures"] = ["clarification demandée"]
        results.append(row)
        log.info(
            "eval.fixture", **{k: v for k, v in row.items() if k != "id"}, id=f["id"]
        )

    judged_rows = [r for r in results if "citations_supported" in r]
    total_cit = sum(r["n_citations"] for r in judged_rows)
    supported = sum(r["citations_supported"] for r in judged_rows)
    empty = sum(r.get("citations_empty", 0) for r in judged_rows)
    traps = [r for r in results if r["category"] == "trap"]
    versions = [r for r in results if r["category"] == "version"]
    anchors = [r for r in results if "anchor_hit" in r]
    concluded = [r for r in results if "conclusion_ok" in r]

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
        "conclusion_correctness": round(
            sum(1 for r in concluded if r["conclusion_ok"]) / len(concluded), 3
        )
        if concluded
        else None,
        "empty_citation_rate": round(empty / total_cit, 3) if total_cit else None,
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
        for key in (
            "citation_precision",
            "trap_refusal",
            "version_accuracy",
            "conclusion_correctness",
            "empty_citation_rate",
        ):
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
    print(f"  citation_precision    : {summary['citation_precision']}")
    print(f"  conclusion_correctness: {summary['conclusion_correctness']}")
    print(f"  trap_refusal          : {summary['trap_refusal']}")
    print(f"  version_accuracy      : {summary['version_accuracy']}")
    print(f"  empty_citation_rate   : {summary['empty_citation_rate']}")
    print(f"  (aux) anchor_recall   : {summary['auxiliary_anchor_recall']}")
    wrong = [
        r
        for r in summary["results"]
        if r.get("conclusion_ok") is False and r.get("conclusion_failures")
    ]
    if wrong:
        # A wrong conclusion is the failure that matters most, so it is
        # named here rather than left inside the archived JSON.
        print("\n  conclusions manquées :")
        for r in wrong:
            print(f"    {r['id']}: {'; '.join(r['conclusion_failures']) or 'juge'}")
    if summary["hard_fail"]:
        print("  *** HARD FAIL: fabricated citation on a trap question ***")
    diff_previous(summary)
    if summary["hard_fail"]:
        sys.exit(2)


if __name__ == "__main__":
    asyncio.run(main())
