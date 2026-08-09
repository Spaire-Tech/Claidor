"""The engine has to survive a real document, not a paragraph.

Vesence's own Word page shows a 186-page, 102,410-word share purchase
agreement. A check that takes five seconds on that is a check nobody runs
twice, so the cost is a property worth testing.

Two algorithmic mistakes were found this way and both were invisible on
short inputs:

- Asking « is this offset inside a definition? » with a linear scan over
  every definition. Sixteen of twenty seconds, 62 million comparisons.
- Computing each finding's occurrence index by walking from the start of
  the document. 2.6 million string searches.

And one that only a *realistic* document exposed: a separate regex pass
per defined term. The repeated-fixture document has fourteen distinct
terms and looked fine; a real agreement has around 170, and it took five
seconds.

The budgets below are deliberately loose. They are here to catch an
algorithm turning quadratic, not to measure a machine.
"""

import random
import time

import pytest

from polar.redline import review_terms

#: Generous by roughly an order of magnitude against measured times of
#: 0.4s and 0.7s. A failure here means the shape of the algorithm changed,
#: not that the test machine was busy.
BUDGET_SECONDS = 5.0


def _realistic_agreement() -> tuple[str, int]:
    """A document shaped like a real SPA: many distinct terms, used once."""
    random.seed(7)
    words = [
        "Closing",
        "Escrow",
        "Locked",
        "Box",
        "Leakage",
        "Warranty",
        "Indemnity",
        "Completion",
        "Purchase",
        "Price",
        "Accounts",
        "Notice",
        "Facility",
        "Security",
        "Transfer",
        "Consent",
        "Permitted",
        "Encumbrance",
        "Material",
        "Adverse",
        "Group",
        "Deed",
        "Schedule",
    ]
    terms = sorted(
        {f"{random.choice(words)} {random.choice(words)}" for _ in range(200)}
    )
    definitions = "\n".join(
        f'"{term}" means the item described in schedule {index}.'
        for index, term in enumerate(terms)
    )
    body = "\n".join(
        f"{index // 10 + 2}.{index % 10} The parties agree that the "
        f"{random.choice(terms)} shall apply and that the "
        f"{random.choice(terms)} shall be delivered under clause 4."
        for index in range(4000)
    )
    document = (
        "SHARE PURCHASE AGREEMENT\n\n1. DEFINITIONS\n\n"
        + definitions
        + "\n\n2. TERMS\n\n"
        + body
    )
    return document, len(terms)


class TestCost:
    def test_a_long_document_is_checked_quickly(self, spa: str) -> None:
        document = spa * 300
        assert len(document) > 500_000

        started = time.perf_counter()
        review_terms(document)
        assert time.perf_counter() - started < BUDGET_SECONDS

    def test_many_distinct_terms_do_not_cost_a_pass_each(self) -> None:
        # The one a repeated fixture cannot catch: cost has to be flat in
        # the number of defined terms, not linear.
        document, term_count = _realistic_agreement()
        assert term_count > 150
        assert len(document) > 500_000

        started = time.perf_counter()
        review_terms(document)
        assert time.perf_counter() - started < BUDGET_SECONDS


class TestCorrectnessAtScale:
    def test_a_correct_agreement_of_real_size_is_clean(self) -> None:
        # Every term defined, used, and in alphabetical order. A long
        # document that is right must come back empty, or length itself
        # becomes a source of noise.
        document, _ = _realistic_agreement()
        assert review_terms(document) == []

    @pytest.mark.parametrize(
        "document",
        [
            "",
            "the parties agree. " * 20_000,
            '"A" ' * 50_000,
            "\n" * 100_000,
            '"' * 50_000,
        ],
    )
    def test_degenerate_input_neither_hangs_nor_raises(self, document: str) -> None:
        started = time.perf_counter()
        review_terms(document)
        assert time.perf_counter() - started < BUDGET_SECONDS
