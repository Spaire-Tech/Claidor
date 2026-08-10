"""What the tie-out agent can reach, and what it refuses.

The loop's own tests live with the dossier and cover the control flow. What
is covered here is the half that decides whether an *answer* can be
trusted: six tools, the shapes they hand back, and the four ways a model
can misuse them.

No database and no network. The tools are pure functions over a workspace
that was loaded before the loop started — which is the property that makes
them testable and is also the reason they cannot reach another deal.
"""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from polar.tieout.agent.tools import (
    DEFINITIONS,
    TOOLS,
    TOOLSET,
    Workspace,
    run_tool,
)


def artifact(filename: str, kind: str = "deck", **rest: object) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        filename=filename,
        kind=kind,
        version=rest.get("version", 1),
        status=rest.get("status", "ready"),
        error=rest.get("error"),
    )


def finding(
    printed: str,
    expected: str,
    *,
    severity: str = "error",
    one_tick: bool = False,
    artifact_id: object = None,
    chain: list[object] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        kind="drift",
        severity=severity,
        state="open",
        one_tick=one_tick,
        title=f"{printed} where the model says {expected}",
        printed=printed,
        expected=expected,
        location="slide 2",
        detail="metric tile",
        artifact_id=artifact_id,
        standard=None,
        rule=None,
        evidence={"source": "Model!D26", "name": "FY2025A adjusted EBITDA"}
        | ({"chain": chain} if chain is not None else {}),
    )


@pytest.fixture
def deal() -> Workspace:
    deck = artifact("cascade_deck.pptx")
    broken = artifact("scans.pdf", kind="source", status="failed", error="No text.")
    return Workspace(
        dossier_id=uuid4(),
        name="Project Cascade",
        artifacts=(deck, broken),
        findings=(
            finding("$49.6mm", "$48.9mm", artifact_id=str(deck.id)),
            finding("10.4x", "9.9x", severity="smell", artifact_id=str(deck.id)),
            finding("18.6%", "18.7%", one_tick=True, artifact_id=str(deck.id)),
        ),
        coverage={
            "reconciled": 108,
            "unlinked": 27,
            "cells": [
                {
                    "ref": "Model!D26",
                    "name": "FY2025A adjusted EBITDA",
                    "value": "48.9",
                },
                {"ref": "DCF!B4", "name": "WACC", "value": "0.098"},
            ],
        },
    )


class TestEverySchemaIsWired:
    def test_every_definition_has_a_tool_behind_it(self) -> None:
        # A tool in the schema with nothing behind it is a tool the model
        # will call once and never get an answer from.
        assert {one["name"] for one in DEFINITIONS} == set(TOOLS)

    def test_the_prompt_mentions_every_tool_by_name(self) -> None:
        # The toolset exists so the schema and the prose cannot drift. This
        # is the assertion that makes that true rather than aspirational.
        prompt = TOOLSET.prompt()
        for name in TOOLS:
            assert name in prompt, f"{name} is callable and unexplained"


class TestWhatItCanSee:
    def test_a_file_that_could_not_be_read_says_so(self, deal: Workspace) -> None:
        # The most useful row in the list: it is the reason figures are
        # unchecked, and an agent shielded from it answers as though the
        # deal were only what it could read.
        result = run_tool(deal, "list_files", {})
        assert result.ok
        broken = [one for one in result.data["files"] if one["status"] == "failed"]
        assert broken[0]["problem"] == "No text."
        assert "1 unreadable" in result.summary

    def test_coverage_carries_what_was_not_checked(self, deal: Workspace) -> None:
        result = run_tool(deal, "coverage", {})
        assert result.data["unlinked"] == 27
        assert "27 not checked" in result.summary

    def test_rounding_differences_are_left_out_unless_asked_for(
        self, deal: Workspace
    ) -> None:
        # One unit at the printed precision is almost always a convention.
        # In by default and the list is noise; out with no way back and the
        # tool is hiding something.
        without = run_tool(deal, "list_findings", {})
        assert without.data["total"] == 2

        with_them = run_tool(deal, "list_findings", {"include_rounding": True})
        assert with_them.data["total"] == 3

    def test_severity_and_filename_narrow_it(self, deal: Workspace) -> None:
        critical = run_tool(deal, "list_findings", {"severity": "critical"})
        assert [one["printed"] for one in critical.data["findings"]] == ["$49.6mm"]

        elsewhere = run_tool(deal, "list_findings", {"filename": "nothing.pptx"})
        assert elsewhere.data["total"] == 0

    def test_a_finding_comes_back_with_the_cell_it_was_checked_against(
        self, deal: Workspace
    ) -> None:
        one = deal.findings[0]
        result = run_tool(deal, "read_finding", {"finding_id": str(one.id)})
        assert result.data["source_cell"] == "Model!D26"
        assert result.data["the_model_says"] == "$48.9mm"

    def test_a_cell_is_found_by_a_few_words_of_its_label(self, deal: Workspace) -> None:
        result = run_tool(deal, "find_cell", {"query": "wacc"})
        assert result.data["total"] == 1
        assert result.data["cells"][0]["ref"] == "DCF!B4"


class TestWhatItRefuses:
    def test_a_finding_from_another_deal_does_not_exist(self, deal: Workspace) -> None:
        # Not « forbidden ». From inside this deal it does not exist, and
        # saying so is both true and the safer answer.
        result = run_tool(deal, "read_finding", {"finding_id": str(uuid4())})
        assert not result.ok
        assert "No finding" in result.summary

    def test_a_search_too_short_to_mean_anything(self, deal: Workspace) -> None:
        result = run_tool(deal, "find_cell", {"query": "a"})
        assert not result.ok

    def test_a_tool_that_does_not_exist(self, deal: Workspace) -> None:
        result = run_tool(deal, "delete_everything", {})
        assert not result.ok
        assert "No tool" in result.summary

    def test_a_tool_called_with_the_wrong_argument(self, deal: Workspace) -> None:
        # A refusal rather than an exception: it stays in the trace and the
        # model can correct itself, where an exception would end the run
        # over a typo.
        result = run_tool(deal, "list_findings", {"sevrity": "critical"})
        assert not result.ok
        assert "called wrongly" in result.summary


class TestTheChain:
    def test_it_is_there_when_the_workspace_loaded_it(self) -> None:
        one = finding(
            "$49.6mm", "$48.9mm", chain=[{"kind": "cell", "ref": "Model!D26"}]
        )
        deal = Workspace(
            dossier_id=uuid4(),
            name="Project Cascade",
            artifacts=(),
            findings=(one,),
            coverage={},
        )
        result = run_tool(deal, "trace_figure", {"finding_id": str(one.id)})
        assert result.ok
        assert result.data["steps"][0]["ref"] == "Model!D26"

    def test_a_missing_chain_is_said_rather_than_faked(self, deal: Workspace) -> None:
        result = run_tool(
            deal, "trace_figure", {"finding_id": str(deal.findings[0].id)}
        )
        assert not result.ok
