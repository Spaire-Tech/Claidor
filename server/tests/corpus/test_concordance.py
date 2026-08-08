"""A computed concordance may leave gaps; it may not invent mappings.

Sending a lawyer to the provision that replaced theirs is the whole point;
sending them to one that did not is worse than saying nothing. So the
tests here care most about what the aligner REFUSES to do: cross two
mappings over each other, pair unrelated provisions, or quietly turn a
repeal into a match.
"""

from polar.corpus.concordance import ArticleRef, align, similarity, tokenize

SAISIE = (
    "À peine d'irrecevabilité, les contestations sont portées devant la "
    "juridiction compétente par voie d'assignation dans le délai d'un mois "
    "à compter de la dénonciation de la saisie au débiteur."
)
DELAI = "Les délais prévus dans le présent Acte Uniforme sont des délais francs."
TIERS = (
    "Le tiers saisi est tenu de déclarer au créancier l'étendue de ses "
    "obligations à l'égard du débiteur ainsi que les modalités qui "
    "pourraient les affecter."
)
SOCIETE = (
    "La société anonyme est constituée par un ou plusieurs associés dont la "
    "responsabilité est limitée au montant de leurs apports."
)


class TestPairing:
    def test_identical_versions_map_one_to_one_unchanged(self) -> None:
        old = [ArticleRef("170", SAISIE), ArticleRef("335", DELAI)]
        result = align(old, list(old))

        assert [m.relation for m in result] == ["unchanged", "unchanged"]
        assert all(m.is_pair for m in result)

    def test_identical_text_under_a_new_number_is_renumbered(self) -> None:
        result = align([ArticleRef("170", SAISIE)], [ArticleRef("172", SAISIE)])

        assert len(result) == 1
        assert result[0].relation == "renumbered"
        assert result[0].new is not None
        assert result[0].new.number == "172"

    def test_a_rewritten_article_keeping_its_number_is_still_matched(self) -> None:
        # The real case: 1998 art. 49 and 2023 art. 49 share about a third
        # of their words and every lawyer reads them as the same rule.
        old_49 = (
            "La juridiction compétente pour statuer sur tout litige ou toute "
            "demande relative à une mesure d'exécution forcée ou à une saisie "
            "conservatoire est le président de la juridiction statuant en "
            "matière d'urgence."
        )
        new_49 = (
            "En matière mobilière, le président de la juridiction compétente "
            "dans chaque État partie ou le juge délégué par lui connaît de "
            "tout litige relatif à une mesure d'exécution."
        )
        assert similarity(tokenize(old_49), tokenize(new_49)) < 0.45

        result = align([ArticleRef("49", old_49)], [ArticleRef("49", new_49)])
        assert result[0].is_pair
        assert result[0].relation == "amended"


class TestRefusals:
    def test_unrelated_provisions_are_never_paired(self) -> None:
        result = align([ArticleRef("170", SAISIE)], [ArticleRef("385", SOCIETE)])

        assert {m.relation for m in result} == {"repealed", "new"}
        assert not any(m.is_pair for m in result)

    def test_a_dropped_article_is_reported_repealed(self) -> None:
        old = [ArticleRef("170", SAISIE), ArticleRef("171", SOCIETE)]
        new = [ArticleRef("170", SAISIE)]
        result = align(old, new)

        repealed = [m for m in result if m.relation == "repealed"]
        assert len(repealed) == 1
        assert repealed[0].old is not None
        assert repealed[0].old.number == "171"

    def test_an_added_article_is_reported_new(self) -> None:
        old = [ArticleRef("170", SAISIE)]
        new = [ArticleRef("170", SAISIE), ArticleRef("171", SOCIETE)]
        result = align(old, new)

        added = [m for m in result if m.relation == "new"]
        assert len(added) == 1
        assert added[0].new is not None
        assert added[0].new.number == "171"

    def test_mappings_never_cross(self) -> None:
        # Legislators renumber; they do not swap two provisions past each
        # other. An alignment that crossed would be free to pair almost
        # anything with anything.
        old = [ArticleRef("1", SAISIE), ArticleRef("2", TIERS), ArticleRef("3", DELAI)]
        new = [
            ArticleRef("10", DELAI),
            ArticleRef("11", TIERS),
            ArticleRef("12", SAISIE),
        ]
        pairs = [(m.old, m.new) for m in align(old, new) if m.is_pair]

        old_order = [old.index(o) for o, _ in pairs]
        new_order = [new.index(n) for _, n in pairs]
        assert old_order == sorted(old_order)
        assert new_order == sorted(new_order)

    def test_every_article_of_both_versions_is_accounted_for(self) -> None:
        old = [ArticleRef("1", SAISIE), ArticleRef("2", SOCIETE)]
        new = [ArticleRef("1", SAISIE), ArticleRef("3", TIERS)]
        result = align(old, new)

        seen_old = [m.old.number for m in result if m.old]
        seen_new = [m.new.number for m in result if m.new]
        assert sorted(seen_old) == ["1", "2"]
        assert sorted(seen_new) == ["1", "3"]

    def test_empty_sides_degrade_without_pairing(self) -> None:
        assert [m.relation for m in align([ArticleRef("1", SAISIE)], [])] == [
            "repealed"
        ]
        assert [m.relation for m in align([], [ArticleRef("1", SAISIE)])] == ["new"]
