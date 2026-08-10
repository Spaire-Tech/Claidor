"""Contradictions between documents, and the three gates in front of them.

This is the most dangerous check in the product. A per-document finding is
arithmetic and either right or a bug; a cross-document one is a *reading*,
and a wrong one reads as authoritative — « the cap in the SPA does not
match the LOI » is the kind of sentence a lawyer acts on.

So almost every test here is about what gets thrown away. The gates run in
code, after the model, and none of them is a judgement call: a quote is in
a document or it is not, an index is in range or it is not, two ids are
equal or they are not.
"""

from typing import Any
from uuid import uuid4

import pytest

from polar.dossier.crosscheck import (
    Commitment,
    CrossCheckReport,
    cross_check,
    describe,
    verify_commitments,
    verify_conflicts,
)
from polar.models.dossier import DossierDocument

MSA = (
    "MASTER SERVICES AGREEMENT\n"
    "The aggregate liability of the Supplier shall not exceed USD 1,800,000.\n"
    "This agreement is governed by the laws of England and Wales.\n"
    "Either party may terminate on thirty (30) days' written notice.\n"
)

LOI = (
    "LETTER OF INTENT\n"
    "Indemnity claims shall be capped at USD 2,500,000 in aggregate.\n"
    "This letter is governed by the laws of England and Wales.\n"
)


def document(text: str | None, *, title: str = "MSA"):
    return DossierDocument(
        id=uuid4(),
        dossier_id=uuid4(),
        file_id=uuid4(),
        uploaded_by_id=uuid4(),
        title=title,
        piece_number=1,
        extracted_text=text,
    )


def commitment(
    document_id: Any = None, *, title: str = "MSA", subject: str = "Liability cap"
) -> Commitment:
    return Commitment(
        document_id=document_id or uuid4(),
        document_title=title,
        subject=subject,
        value="USD 1,800,000",
        quote="shall not exceed USD 1,800,000",
        start=0,
        end=30,
    )


class TestTheQuoteGate:
    """Stage one: a commitment must be in the document it is credited to."""

    def test_a_real_quote_is_kept_and_located(self) -> None:
        report = CrossCheckReport()
        kept = verify_commitments(
            document(MSA),
            [
                {
                    "subject": "Liability cap",
                    "value": "USD 1,800,000",
                    "quote": "shall not exceed USD 1,800,000",
                }
            ],
            report,
        )

        assert len(kept) == 1
        assert MSA[kept[0].start : kept[0].end] == kept[0].quote

    def test_an_invented_quote_is_dropped(self) -> None:
        report = CrossCheckReport()
        kept = verify_commitments(
            document(MSA),
            [
                {
                    "subject": "Liability cap",
                    "value": "USD 9,000,000",
                    "quote": "shall not exceed USD 9,000,000",
                }
            ],
            report,
        )

        assert kept == []
        assert report.unquotable == 1

    def test_a_quote_across_a_line_break_is_still_a_quote(self) -> None:
        # A model reproducing a passage will not reproduce the newline in
        # the middle of it, and rejecting real quotes over that would throw
        # away good findings. locate_quote normalises whitespace.
        report = CrossCheckReport()
        kept = verify_commitments(
            document("The cap shall not\nexceed USD 1,800,000."),
            [
                {
                    "subject": "Cap",
                    "value": "1.8M",
                    "quote": "The cap shall not exceed USD 1,800,000.",
                }
            ],
            report,
        )

        assert len(kept) == 1

    def test_a_commitment_with_no_subject_is_dropped(self) -> None:
        report = CrossCheckReport()
        kept = verify_commitments(
            document(MSA),
            [{"subject": "", "value": "x", "quote": "shall not exceed USD 1,800,000"}],
            report,
        )

        assert kept == []
        assert report.unquotable == 1

    def test_an_unreadable_document_yields_nothing(self) -> None:
        report = CrossCheckReport()

        kept = verify_commitments(document(None), [{"quote": "anything"}], report)

        assert kept == []


class TestTheInventionGate:
    """Stage two: a conflict must be between commitments we extracted."""

    def test_a_conflict_between_two_real_commitments_is_kept(self) -> None:
        report = CrossCheckReport()
        left = commitment(title="MSA")
        right = commitment(title="LOI")

        kept = verify_conflicts(
            [left, right],
            [{"left": 0, "right": 1, "note": "1.8M against 2.5M."}],
            report,
        )

        assert len(kept) == 1
        assert kept[0].left.document_title == "MSA"
        assert kept[0].right.document_title == "LOI"

    def test_an_index_outside_the_list_is_dropped(self) -> None:
        # The comparison step no longer has a document in front of it,
        # which is exactly where invention is most plausible.
        report = CrossCheckReport()

        kept = verify_conflicts(
            [commitment(), commitment()],
            [{"left": 0, "right": 7, "note": "invented"}],
            report,
        )

        assert kept == []
        assert report.invented == 1

    def test_a_negative_index_is_dropped(self) -> None:
        report = CrossCheckReport()

        kept = verify_conflicts(
            [commitment(), commitment()],
            [{"left": -1, "right": 0, "note": "wraps around in Python"}],
            report,
        )

        assert kept == []
        assert report.invented == 1

    def test_a_non_integer_index_is_dropped(self) -> None:
        report = CrossCheckReport()

        kept = verify_conflicts(
            [commitment(), commitment()],
            [{"left": "the MSA one", "right": 1, "note": "x"}],
            report,
        )

        assert kept == []
        assert report.invented == 1

    def test_a_conflict_with_no_explanation_is_dropped(self) -> None:
        # "The cap differs" is unusable; an empty note is worse.
        report = CrossCheckReport()

        kept = verify_conflicts(
            [commitment(), commitment()], [{"left": 0, "right": 1, "note": "  "}], report
        )

        assert kept == []


class TestTheSameDocumentGate:
    def test_two_commitments_from_one_document_are_not_a_cross_document_conflict(
        self,
    ) -> None:
        # A contradiction inside one document is real and is
        # redline/judgement.py's job. Surfacing it here would report the
        # same defect twice, under a name that claims something stronger.
        report = CrossCheckReport()
        shared = uuid4()

        kept = verify_conflicts(
            [commitment(shared), commitment(shared)],
            [{"left": 0, "right": 1, "note": "same file"}],
            report,
        )

        assert kept == []
        assert report.same_document == 1


class TestBookkeeping:
    def test_the_same_pair_twice_is_one_conflict(self) -> None:
        report = CrossCheckReport()
        left, right = commitment(), commitment()

        kept = verify_conflicts(
            [left, right],
            [
                {"left": 0, "right": 1, "note": "first"},
                {"left": 1, "right": 0, "note": "the same pair, reversed"},
            ],
            report,
        )

        assert len(kept) == 1

    def test_the_report_accounts_for_everything_dropped(self) -> None:
        # kept + dropped must equal proposed, or the summary is lying about
        # how much of the model's output survived.
        report = CrossCheckReport()
        shared = uuid4()
        commitments = [commitment(shared), commitment(shared), commitment()]
        proposed = [
            {"left": 0, "right": 1, "note": "same document"},
            {"left": 0, "right": 9, "note": "invented"},
            {"left": 0, "right": 2, "note": "real"},
        ]
        report.proposed = len(proposed)

        kept = verify_conflicts(commitments, proposed, report)

        assert len(kept) == 1
        assert report.kept == 1
        assert report.invented + report.same_document == 2

    def test_the_description_carries_the_index_the_model_must_use(self) -> None:
        text = describe([commitment(title="MSA"), commitment(title="LOI")])

        assert "[0] MSA" in text
        assert "[1] LOI" in text


# ---- The whole thing, with a scripted model ---------------------------


class FakeBlock:
    def __init__(self, **fields: Any) -> None:
        self.__dict__.update(fields)


class FakeUsage:
    input_tokens = 10
    output_tokens = 5


class FakeMessage:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.content = [FakeBlock(type="tool_use", input=payload)]
        self.usage = FakeUsage()


class FakeMessages:
    def __init__(self, script: list[Any]) -> None:
        self.script = list(script)

    async def create(self, **kwargs: Any) -> FakeMessage:
        nxt = self.script.pop(0)
        if isinstance(nxt, Exception):
            raise nxt
        return nxt


class FakeClient:
    def __init__(self, *script: Any) -> None:
        self.messages = FakeMessages(list(script))


@pytest.mark.asyncio
class TestEndToEnd:
    async def test_a_real_conflict_survives_all_three_gates(self) -> None:
        msa, loi = document(MSA, title="MSA"), document(LOI, title="LOI")
        client = FakeClient(
            FakeMessage(
                {
                    "commitments": [
                        {
                            "subject": "Liability cap",
                            "value": "USD 1,800,000",
                            "quote": "shall not exceed USD 1,800,000",
                        }
                    ]
                }
            ),
            FakeMessage(
                {
                    "commitments": [
                        {
                            "subject": "Indemnity cap",
                            "value": "USD 2,500,000",
                            "quote": "capped at USD 2,500,000 in aggregate",
                        }
                    ]
                }
            ),
            FakeMessage(
                {
                    "conflicts": [
                        {
                            "left": 0,
                            "right": 1,
                            "note": "The MSA caps liability at USD 1.8M; the LOI at 2.5M.",
                        }
                    ]
                }
            ),
        )

        conflicts, report = await cross_check(client, [msa, loi])

        assert len(conflicts) == 1
        assert conflicts[0].left.document_title == "MSA"
        assert conflicts[0].right.document_title == "LOI"
        assert report.kept == 1
        # Both quotes are in their own documents, which is what lets the
        # panel show a reader both sentences.
        assert MSA[conflicts[0].left.start : conflicts[0].left.end] in MSA
        assert LOI[conflicts[0].right.start : conflicts[0].right.end] in LOI

    async def test_documents_that_agree_produce_nothing(self) -> None:
        # The normal case, and the one a check like this must get right:
        # a transaction whose documents agree should be quiet.
        client = FakeClient(
            FakeMessage({"commitments": []}),
            FakeMessage({"commitments": []}),
        )

        conflicts, report = await cross_check(
            client, [document(MSA), document(LOI, title="LOI")]
        )

        assert conflicts == []
        assert report.commitments == 0

    async def test_an_unreadable_document_is_counted_not_read(self) -> None:
        client = FakeClient(FakeMessage({"commitments": []}))

        _, report = await cross_check(
            client, [document(MSA), document(None, title="Scan")]
        )

        assert report.documents_read == 1
        assert report.unreadable == 1

    async def test_a_failed_extraction_does_not_lose_the_other_documents(self) -> None:
        client = FakeClient(
            RuntimeError("provider down"),
            FakeMessage(
                {
                    "commitments": [
                        {
                            "subject": "Indemnity cap",
                            "value": "USD 2,500,000",
                            "quote": "capped at USD 2,500,000 in aggregate",
                        }
                    ]
                }
            ),
            FakeMessage({"conflicts": []}),
        )

        conflicts, report = await cross_check(
            client, [document(MSA), document(LOI, title="LOI")]
        )

        assert conflicts == []
        assert report.commitments == 1
        assert len(report.failures) == 1

    async def test_one_commitment_is_never_compared_with_itself(self) -> None:
        # Fewer than two commitments means no comparison call at all — and
        # the script would raise IndexError if one were made.
        client = FakeClient(
            FakeMessage(
                {
                    "commitments": [
                        {
                            "subject": "Cap",
                            "value": "1.8M",
                            "quote": "shall not exceed USD 1,800,000",
                        }
                    ]
                }
            )
        )

        conflicts, _ = await cross_check(client, [document(MSA)])

        assert conflicts == []
