"""The word-break repair must fix breaks and never invent them.

The corpus is quoted verbatim to lawyers, so this pass is held to a strict
bargain: it may only join two fragments when the result is a word the
CLEAN part of the corpus already contains, and it must leave genuine
two-word sequences alone — « délai franc » is not a broken « délaifranc ».
"""

from scripts.corpus_fix_spacing import build_vocab, repair

#: A stand-in for the vocabulary built from the clean articles.
VOCAB = {
    "la",
    "le",
    "les",
    "peut",
    "délais",
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

    def test_break_before_a_single_letter_is_rejoined(self) -> None:
        # « peu t », « pou r », « le s » — the orphan letter falls on the
        # right as often as on the left, and both are the same artifact.
        fixed, _ = repair("le juge peu t statuer dans le s délais", VOCAB)
        assert "peut statuer" in fixed
        assert "les délais" in fixed


class TestVocabulary:
    def test_a_stray_letter_in_a_clean_source_is_not_a_word(self) -> None:
        # This is what let « peu t » survive: « t » appeared once in a clean
        # article, so both halves looked known and the pair looked genuine.
        vocab = build_vocab(["le juge t statue", "il peut statuer"])
        assert "t" not in vocab
        assert "peut" in vocab

    def test_the_three_real_single_letter_words_are_kept(self) -> None:
        vocab = build_vocab(["il a statué", "il y a lieu", "quant à la saisie"])
        assert {"a", "y", "à"} <= vocab


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
