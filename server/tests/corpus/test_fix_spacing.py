"""The word-break repair must fix breaks and never invent them.

The corpus is quoted verbatim to lawyers, so this pass is held to a strict
bargain: it may only join two fragments when the result is a word the
CLEAN part of the corpus already contains, and it must leave genuine
two-word sequences alone — « délai franc » is not a broken « délaifranc ».
"""

from scripts.corpus_fix_spacing import repair

#: A stand-in for the vocabulary built from the clean articles.
VOCAB = {
    "la",
    "le",
    "de",
    "des",
    "portées",
    "contestation",
    "litige",
    "saisie",
    "délai",
    "franc",
    "francs",
    "décision",
    "juridiction",
    "a",
    "l",
    "d",
    "s",
    "y",
    "inscrire",
    "est",
    "sont",
    "dans",
    "un",
}


class TestRepairsRealBreaks:
    def test_unknown_fragment_is_rejoined(self) -> None:
        fixed, joins = repair("les contestations sont po rtées devant", VOCAB)
        assert "sont portées devant" in fixed
        assert joins == ["po rtées -> portées"]

    def test_break_after_a_single_letter_is_rejoined(self) -> None:
        # Neither « l » nor « a » is unknown, so only the orphan-letter rule
        # can reach this one.
        fixed, _ = repair("à peine de caducité, l a saisie est dénoncée", VOCAB)
        assert "la saisie est dénoncée" in fixed

    def test_repeated_fragments_collapse_to_one_word(self) -> None:
        fixed, _ = repair("la contesta tion", VOCAB)
        assert fixed == "la contestation"


class TestLeavesGoodTextAlone:
    def test_two_real_words_are_never_glued(self) -> None:
        # Both words exist and neither is a lone letter: hands off.
        fixed, joins = repair("les délais sont des délai franc", VOCAB)
        assert "délai franc" in fixed
        assert joins == []

    def test_a_lone_verb_a_is_not_swallowed(self) -> None:
        # « a » is a word (il a). Gluing it would rewrite the sentence.
        fixed, _ = repair("le juge a rejeté", VOCAB)
        assert "a rejeté" in fixed

    def test_an_elision_after_a_single_letter_is_not_corrupted(self) -> None:
        # « de s'inscrire »: joining de+s gives « des », which IS a word —
        # and would produce « des'inscrire ». The apostrophe means the
        # fragment is already a whole word, so the pair must be skipped.
        fixed, joins = repair("refus de s'inscrire", VOCAB)
        assert fixed == "refus de s'inscrire"
        assert joins == []

    def test_text_without_breaks_is_returned_unchanged(self) -> None:
        original = (
            "Les délais prévus dans le présent Acte Uniforme sont des délais francs."
        )
        fixed, joins = repair(original, VOCAB)
        assert fixed == original
        assert joins == []
