"""The accountants' dictionary: loading, normalising, and the three tiers.

Registered in `docs/pierce/taxonomy-coverage.md`: a label is named
exactly or not at all; the filers' tier says how many agreed; a row
the dictionary cannot name is answered « none », never guessed.
"""

from __future__ import annotations

from polar.tieout.meaning import normalise, vocabulary
from polar.tieout.meaning.vocabulary import qualifiers, words_of


class TestNormalising:
    def test_qualifiers_and_suffixes_come_off_the_end(self) -> None:
        assert normalise("Interest - nominal (WR)") == "interest"
        assert normalise("Opening Floating rate debt (ADDN1) - nominal") == (
            "opening floating rate debt"
        )
        assert qualifiers("Interest - nominal (WR)") == ("(WR)", "nominal")

    def test_years_units_and_punctuation_go(self) -> None:
        assert normalise("Revenue 2025/26 (£m)") == "revenue"
        #: A parenthetical comes off only when it is a code or a
        #: qualifier word; « (benefit) » is part of the name and stays.
        assert normalise("Income tax expense (benefit)") == "income tax expense benefit"
        assert normalise("Tax paid (WR)") == "tax paid"
        assert normalise("Tax paid (nominal)") == "tax paid"

    def test_entity_words_in_the_middle_are_qualifiers(self) -> None:
        """The PR24 statements scored zero on the first run because
        every label carries the entity — `Revenue - Appointee -
        nominal` — and only the last suffix came off."""
        assert normalise("Revenue - Appointee - nominal") == "revenue"
        assert (
            normalise("Operating profit - Wholesale - real (WR)") == "operating profit"
        )
        assert qualifiers("Revenue - Appointee - nominal") == ("nominal", "Appointee")

    def test_concept_names_split_into_words(self) -> None:
        assert (
            words_of("NetCurrentAssetsLiabilities") == "net current assets liabilities"
        )
        assert words_of("CashBankOnHand") == "cash bank on hand"


class TestTheDictionary:
    def test_it_loads_both_taxonomies_with_sign_and_period(self) -> None:
        vocab = vocabulary()
        assert vocab.size > 10_000
        revenues = vocab.concept("Revenues")
        assert revenues is not None
        assert (revenues.balance, revenues.period) == ("credit", "duration")
        cash = vocab.concept("CashBankOnHand", source="frc")
        assert cash is not None
        assert (cash.balance, cash.period) == ("debit", "instant")

    def test_an_exact_taxonomy_label_is_named_with_its_reason(self) -> None:
        match = vocabulary().match("Income Tax Expense (Benefit)")
        assert match.tier == "exact"
        assert match.concept is not None
        assert match.concept.name == "IncomeTaxExpenseBenefit"
        assert match.concept.balance == "debit"
        assert "us-gaap name" in match.why

    def test_a_filers_label_is_named_by_majority_with_the_count(self) -> None:
        #: « Provision for income taxes » is how 1,028 statement lines
        #: wrote the income-tax line in 2026 Q2; no taxonomy label says it.
        match = vocabulary().match("Provision for income taxes")
        assert match.tier == "filers"
        assert match.concept is not None
        assert match.concept.name == "IncomeTaxExpenseBenefit"
        assert match.agreed >= 500
        assert "filers' lines" in match.why

    def test_a_qualified_regulator_label_still_names(self) -> None:
        match = vocabulary().match("Depreciation - nominal (WR)")
        assert match.tier == "exact"
        assert match.concept is not None
        assert match.concept.name == "Depreciation"
        assert match.qualifiers == ("(WR)", "nominal")

    def test_a_split_among_filers_is_not_a_name(self) -> None:
        """« Total revenue » was tagged two ways by filers in 2026 Q2,
        neither by most of them. A plurality is a guess; the answer is
        none, with the split said."""
        match = vocabulary().match("Total revenue")
        assert match.tier == "none"
        assert match.concept is None
        assert match.why.startswith("US filers split:")
        assert match.agreed > 0
        assert match.disagreed >= match.agreed

    def test_a_row_the_dictionary_cannot_name_is_none_not_a_guess(self) -> None:
        for label in ("Drawdown", "DSCR", "Availability payment", "Line Reference"):
            match = vocabulary().match(label)
            assert match.tier == "none", (label, match)
            assert match.concept is None

    def test_an_empty_label_is_none(self) -> None:
        assert vocabulary().match("   ").tier == "none"

    def test_a_schedule_word_is_never_named(self) -> None:
        """US filers tag « Opening balance » as equity because that is
        where their equity roll-forward says it. In a debt schedule it
        is debt. The first run named 648 such rows in the close models;
        the word names a place in a schedule, not a line of accounts."""
        for label in ("Opening Balance", "Closing balance", "Subtotal", "Total", "b/f"):
            match = vocabulary().match(label)
            assert match.tier == "none", label
            assert "schedule word" in match.why

    def test_british_operating_income_is_a_dialect_collision_the_count_shows(
        self,
    ) -> None:
        """« Operating income » in Ofwat's model is income, between
        Revenue and Opex; in the United States it is operating profit.
        Stripping « (Loss) » made the two meet at the exact tier on the
        first run; that is fixed. The filers' tier still names it the
        American way — 897 of 897 US statement lines written this way
        are operating profit — and that is a true count of a different
        dialect, recorded on the match, not a rule to hack. The
        dialect question is named in taxonomy-coverage.md for its own
        round."""
        match = vocabulary().match("Operating income - nominal (BR)", dialect="us")
        assert match.tier == "filers"
        assert match.concept is not None
        assert match.concept.name == "OperatingIncomeLoss"
        assert match.agreed > 500
        assert match.disagreed == 0


class TestTheBritishSource:
    """The UK filers' tier and the dialect order (uk-filer-labels.md),
    on a small dictionary built in memory so the test says exactly
    what each country's filers wrote."""

    def _vocab(self) -> object:
        from polar.tieout.meaning.vocabulary import Concept, Vocabulary

        concepts = [
            Concept(
                "us-gaap",
                "OperatingIncomeLoss",
                "credit",
                "duration",
                "Operating Income (Loss)",
                None,
                None,
            ),
            Concept(
                "frc", "TurnoverRevenue", "credit", "duration", "Turnover", None, None
            ),
            Concept(
                "frc", "OperatingProfitLoss", "credit", "duration", None, None, None
            ),
            Concept("frc", "Creditors", "credit", "instant", "Creditors", None, None),
        ]
        us = {"operating income": {"OperatingIncomeLoss": [897, 0]}}
        uk = {
            "operating profit": {"OperatingProfitLoss": [40, 0]},
            "creditors amounts falling due within one year": {"Creditors": [900, 0]},
            "operating income": {"TurnoverRevenue": [4, 0]},
        }
        return Vocabulary(concepts, us, uk)

    def test_uk_dialect_asks_uk_filers_first(self) -> None:
        vocab = self._vocab()
        match = vocab.match(
            "Creditors: amounts falling due within one year", dialect="uk"
        )  # type: ignore[attr-defined]
        assert match.tier == "uk-filers"
        assert match.concept is not None
        assert match.concept.name == "Creditors"
        assert "UK filers" in match.why

    def test_the_dialect_order_decides_a_two_country_word(self) -> None:
        vocab = self._vocab()
        british = vocab.match("Operating income", dialect="uk")  # type: ignore[attr-defined]
        american = vocab.match("Operating income", dialect="us")  # type: ignore[attr-defined]
        assert british.tier == "uk-filers"
        assert british.concept is not None
        assert british.concept.name == "TurnoverRevenue"
        assert american.tier == "filers"
        assert american.concept is not None
        assert american.concept.name == "OperatingIncomeLoss"

    def test_a_label_only_one_country_writes_is_still_named_under_either_dialect(
        self,
    ) -> None:
        vocab = self._vocab()
        for dialect in ("uk", "us"):
            match = vocab.match("Operating profit", dialect=dialect)  # type: ignore[attr-defined]
            assert match.tier == "uk-filers", dialect
            assert match.concept is not None
            assert match.concept.name == "OperatingProfitLoss"

    def test_the_shipped_uk_pairs_name_british_statement_lines(self) -> None:
        """The distilled Companies House pairs, when present: the
        British balance-sheet lines every small company files."""
        vocab = vocabulary()
        if not vocab.filers["frc"]:
            import pytest

            pytest.skip("uk_filer_labels.json.gz not built")
        match = vocab.match(
            "Creditors: amounts falling due within one year", dialect="uk"
        )
        assert match.tier in ("exact", "uk-filers")
        assert match.concept is not None
        assert match.concept.source == "frc"
