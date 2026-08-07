"""The comparison must read like a lawyer's reading of two texts."""

from polar.analysis.diff import (
    ChangeKind,
    compare_articles,
    diff_words,
    split_alineas,
)

ART_170_1998 = (
    "À peine d'irrecevabilité, les contestations sont portées devant la "
    "juridiction compétente.\n\n"
    "Le délai de contestation est d'un mois.\n\n"
    "Le tiers saisi déclare l'étendue de ses obligations.\n\n"
    "La mainlevée est ordonnée sans délai."
)

ART_170_2023 = (
    "À peine d'irrecevabilité, les contestations sont portées devant la "
    "juridiction compétente.\n\n"
    "La notification peut être faite par voie électronique.\n\n"
    "Le délai de contestation est d'un mois à compter de la dénonciation.\n\n"
    "Le tiers saisi déclare l'étendue de ses obligations."
)


class TestSplitting:
    def test_alineas_split_on_blank_lines(self) -> None:
        assert len(split_alineas(ART_170_1998)) == 4

    def test_empty_text_has_no_alineas(self) -> None:
        assert split_alineas("   \n\n  ") == []


class TestWordDiff:
    def test_reassembling_the_runs_gives_back_both_texts(self) -> None:
        old = "Le délai de contestation est d'un mois."
        new = "Le délai de contestation est d'un mois à compter de la dénonciation."
        runs = diff_words(old, new)

        assert "".join(r.text for r in runs if r.op in ("equal", "delete")) == old
        assert "".join(r.text for r in runs if r.op in ("equal", "insert")) == new

    def test_identical_text_is_all_equal(self) -> None:
        runs = diff_words("même texte", "même texte")
        assert [r.op for r in runs] == ["equal"]


class TestComparison:
    def test_an_added_alinea_is_reported_where_it_sits(self) -> None:
        comparison = compare_articles(ART_170_1998, ART_170_2023)
        added = [c for c in comparison.changes if c.kind == ChangeKind.added]

        assert len(added) == 1
        # It is the second alinéa of the NEW text: the number must point at
        # the version where the reader can go and find it.
        assert added[0].alinea == 2
        assert "voie électronique" in added[0].excerpt
        assert added[0].sign == "+"

    def test_a_removed_alinea_is_reported(self) -> None:
        comparison = compare_articles(ART_170_1998, ART_170_2023)
        removed = [c for c in comparison.changes if c.kind == ChangeKind.removed]

        assert len(removed) == 1
        assert "mainlevée" in removed[0].excerpt
        assert removed[0].sign == "−"

    def test_a_reworded_alinea_stays_one_alinea(self) -> None:
        # The delay alinéa was extended, not deleted and re-added: the whole
        # point of aligning before diffing.
        comparison = compare_articles(ART_170_1998, ART_170_2023)
        modified = [c for c in comparison.changes if c.kind == ChangeKind.modified]

        assert len(modified) == 1
        assert "compter de la dénonciation" in modified[0].excerpt

        pair = next(p for p in comparison.pairs if p.kind == ChangeKind.modified)
        assert pair.old_index == 2
        assert pair.new_index == 3
        # And the unchanged head of the alinéa is not repainted as new.
        assert any(r.op == "equal" and "délai" in r.text for r in pair.runs)

    def test_unchanged_alineas_produce_no_noise(self) -> None:
        comparison = compare_articles(ART_170_1998, ART_170_1998)

        assert comparison.identical
        assert comparison.changes == []
        assert all(p.kind is None for p in comparison.pairs)

    def test_every_alinea_of_both_versions_is_accounted_for(self) -> None:
        comparison = compare_articles(ART_170_1998, ART_170_2023)

        olds = [p.old_index for p in comparison.pairs if p.old_index]
        news = [p.new_index for p in comparison.pairs if p.new_index]
        assert sorted(olds) == [1, 2, 3, 4]
        assert sorted(news) == [1, 2, 3, 4]
        # Order is preserved: the reader follows the text top to bottom.
        assert olds == sorted(olds)
        assert news == sorted(news)

    def test_an_entirely_different_text_is_not_forced_into_alignment(self) -> None:
        comparison = compare_articles(
            "Le débiteur dispose d'un délai de quinze jours.",
            "La société anonyme est constituée par un ou plusieurs associés.",
        )
        kinds = {c.kind for c in comparison.changes}

        assert kinds == {ChangeKind.added, ChangeKind.removed}
