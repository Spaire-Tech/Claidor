"""The document's defined terms, as a reader wants them.

Nothing here is a defect, so nothing here has a severity. It is the map a
lawyer wants when they open a long agreement somebody else drafted: what
does this term mean, where does it bite, and what does its definition rest
on.

No model is involved, so every assertion below is about what the document
actually says.
"""

from polar.redline.index import MEANING, definitions_index

SPA = (
    '(1) ACME HOLDINGS INC., a Delaware corporation (the "Seller"); and\n'
    '(2) ZENITH PARTNERS LLC, a Washington company (the "Buyer").\n\n'
    "1. DEFINITIONS\n\n"
    '"Accounts" means the audited financial statements of the Company.\n\n'
    '"Company" means Acme Operating Co.\n\n'
    '"Closing Date" means the third Business Day after the Conditions are '
    "satisfied.\n\n"
    '"Business Day" means a day other than a Saturday or Sunday.\n\n'
    '"Conditions" means the conditions in Schedule 1.\n\n'
    '"Dead Term" means something nobody uses.\n\n'
    "2. SALE\n\n"
    "The Seller shall deliver the Accounts to the Buyer on the Closing "
    "Date, and the Seller warrants the Conditions are satisfied on that "
    "Closing Date.\n"
)


def _entry(text: str, term: str):
    return next(e for e in definitions_index(text) if e.term == term)


class TestWhatATermMeans:
    def test_a_definitions_list_entry_reads_forward(self) -> None:
        assert _entry(SPA, "Accounts").meaning.startswith("means the audited")

    def test_a_party_named_in_the_preamble_reads_backward(self) -> None:
        # « ACME HOLDINGS INC. (the "Seller") » puts the meaning *before*
        # the term. Reading forward gives the next party in the list, and
        # the first version of this returned « ). » for the Buyer.
        assert (
            _entry(SPA, "Seller").meaning
            == "ACME HOLDINGS INC., a Delaware corporation"
        )
        assert (
            _entry(SPA, "Buyer").meaning == "ZENITH PARTNERS LLC, a Washington company"
        )

    def test_the_party_marker_is_not_part_of_the_name(self) -> None:
        assert not _entry(SPA, "Buyer").meaning.startswith("(2)")

    def test_a_long_definition_is_trimmed_on_a_word(self) -> None:
        text = '"Long" means ' + "word " * 400 + "end. The Long applies."
        meaning = _entry(text, "Long").meaning
        assert len(meaning) <= MEANING + 1
        assert meaning.endswith("…")

    def test_how_it_was_defined_is_recorded(self) -> None:
        assert _entry(SPA, "Seller").kind == "aside"
        assert _entry(SPA, "Accounts").kind == "means"


class TestWhereATermIsUsed:
    def test_uses_outside_the_definition_are_counted(self) -> None:
        # « Closing Date » is used twice in clause 2 and appears once in
        # its own definition, which is not a use.
        assert _entry(SPA, "Closing Date").use_count == 2

    def test_the_offsets_point_at_the_term(self) -> None:
        entry = _entry(SPA, "Seller")
        for offset in entry.uses:
            assert SPA[offset : offset + len("Seller")] == "Seller"

    def test_a_term_nobody_uses_has_none(self) -> None:
        assert _entry(SPA, "Dead Term").use_count == 0

    def test_that_is_the_same_thing_the_check_reports(self) -> None:
        # The panel shows an unused count beside the list, and it must
        # agree with the unused-definition findings or the reader trusts
        # neither.
        from polar.redline import Defect, review_terms

        unused_here = {e.term for e in definitions_index(SPA) if e.use_count == 0}
        unused_there = {
            f.term for f in review_terms(SPA) if f.defect is Defect.unused_definition
        }
        assert unused_here == unused_there


class TestLinkedTerms:
    def test_a_definition_that_rests_on_others_says_so(self) -> None:
        # « Closing Date means the third Business Day after the Conditions »
        # rests on two other definitions. This is the thing that is hard to
        # hold in your head at clause 140.
        assert _entry(SPA, "Closing Date").linked == ["Business Day", "Conditions"]

    def test_a_self_contained_definition_links_to_nothing(self) -> None:
        assert _entry(SPA, "Business Day").linked == []

    def test_a_definition_does_not_link_to_itself(self) -> None:
        for entry in definitions_index(SPA):
            assert entry.term not in entry.linked

    def test_a_mention_outside_the_definition_is_not_a_link(self) -> None:
        # « Company » appears in clause 2 as well; only the mention inside
        # this definition's own body counts.
        assert "Company" not in _entry(SPA, "Business Day").linked


class TestOrderAndEdges:
    def test_terms_come_back_in_the_order_the_document_defines_them(self) -> None:
        starts = [e.start for e in definitions_index(SPA)]
        assert starts == sorted(starts)

    def test_a_term_defined_twice_appears_once(self) -> None:
        # Two entries for one term give a reader no way to tell which
        # governs. The duplicate is a defect and is reported as one.
        text = SPA + '\n"Company" means something else entirely.\n'
        assert [e.term for e in definitions_index(text)].count("Company") == 1

    def test_the_first_definition_is_the_one_kept(self) -> None:
        text = SPA + '\n"Company" means something else entirely.\n'
        assert _entry(text, "Company").start == _entry(SPA, "Company").start

    def test_empty_text_gives_nothing(self) -> None:
        assert definitions_index("") == []

    def test_a_document_with_no_definitions_gives_nothing(self) -> None:
        assert definitions_index("The parties agree to meet on Tuesday.") == []

    def test_every_span_lands_on_its_own_term(self) -> None:
        for entry in definitions_index(SPA):
            assert SPA[entry.start : entry.end] == entry.term
