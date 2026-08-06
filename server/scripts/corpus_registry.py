"""Registry of every OHADA work in the corpus.

One declarative table drives the generic loader (``scripts.corpus_load``):
which acts exist, which temporal versions each has, where the acquired
source file lives, and — critically for the citation graph — the
*context pattern* that must appear near an "article N" mention in a
decision before that mention may create an edge to this act. Patterns are
deliberately discriminating (never a bare "acte uniforme", which any act
matches); a citation that names no recognizable act creates no edge.

Dates are the published entry-into-force dates (Treaty art. 9: ninety days
after publication in the OHADA official gazette unless the act provides
otherwise). Version targeting for decisions picks the version whose
``in_force_from`` most recently precedes the decision date.
"""

from dataclasses import dataclass
from datetime import date

_ACTS_DIR_HINT = "corpus/raw/acts"


@dataclass(frozen=True)
class VersionSpec:
    label: str
    # Filename under corpus/raw/acts (Laws.Africa AKN HTML), or None when the
    # version comes from a non-AKN source handled by a dedicated loader
    # (the 1998 AUPSRVE PDF).
    file: str | None
    akn_expression_uri: str | None
    adopted_on: date
    published_on: date | None
    in_force_from: date
    gazette_reference: str | None
    transitional_rule: str | None = None


@dataclass(frozen=True)
class ActSpec:
    short_code: str
    title: str
    akn_work_uri: str
    # Regex (case-insensitive) that must appear within the citation window
    # for an "article N" mention to attach to this act.
    context_pattern: str
    versions: tuple[VersionSpec, ...]


def _uri(work: str, at: str) -> str:
    return f"{work}/fra@{at}"


_W_TREATY = "/akn/aa-ohada/act/treaty/1993/ohada"
_W_AUDCG_1997 = "/akn/aa-ohada/act/1997/droit-commercial-général"
_W_AUDCG_2010 = "/akn/aa-ohada/act/2010/droit-commercial-général"
_W_AUS = "/akn/aa-ohada/act/2010/organisation-des-sûretés"
_W_AUSCGIE = (
    "/akn/aa-ohada/act/2014/sociétés-commerciales-groupement-d-intérêt-économique"
)
_W_AUSCOOP = (
    "/akn/aa-ohada/act/2010/acte-uniforme-relatif-au-droit-des-societes-cooperatives"
)
_W_AUPC = (
    "/akn/aa-ohada/act/2015/"
    "organisation-des-procédures-collectives-d-apurement-du-passif"
)
_W_AUA = "/akn/aa-ohada/act/2017/droit-de-l-arbitrage"
_W_AUM = "/akn/aa-ohada/act/2017/acte-relatif-a-la-mediation"
_W_AUCTMR = "/akn/aa-ohada/act/2003/contrats-de-transport-de-marchandises-par-route"
_W_AUPSRVE = (
    "/akn/aa-ohada/act/2023/"
    "organisation-des-procédures-simplifiées-de-recouvrement"
    "-et-des-voies-d-exécution"
)

TRANSITIONAL_RULE_AUPSRVE_1998 = (
    "Les procédures et mesures d'exécution engagées avant le 16 février 2024 "
    "demeurent régies par l'Acte uniforme du 10 avril 1998 ; l'Acte révisé de "
    "2023 ne s'applique qu'aux procédures engagées à compter de son entrée en "
    "vigueur."
)

REGISTRY: tuple[ActSpec, ...] = (
    ActSpec(
        short_code="TRAITE",
        title=(
            "Traité relatif à l'harmonisation du droit des affaires en Afrique "
            "(révisé à Québec le 17 octobre 2008)"
        ),
        akn_work_uri=_W_TREATY,
        # "du/le/au Traité" (citation forms) — never the verb "a traité".
        context_pattern=r"(?:du|le|au)\s+trait[ée]\b|trait[ée]\s+(?:OHADA|relatif|institutif)",
        versions=(
            VersionSpec(
                label="2008",
                file="akn_aa-ohada_act_treaty_1993_ohada_fra_at_2008-10-17.html",
                akn_expression_uri=_uri(_W_TREATY, "2008-10-17"),
                adopted_on=date(2008, 10, 17),
                published_on=None,
                in_force_from=date(2010, 3, 21),
                gazette_reference="Traité de Québec, 17 octobre 2008",
            ),
        ),
    ),
    ActSpec(
        short_code="AUDCG",
        title="Acte uniforme portant sur le droit commercial général",
        # The 2010 revision is a distinct AKN work on Laws.Africa; we keep the
        # current work as the act's canonical URI and model 1997 as a version.
        akn_work_uri=_W_AUDCG_2010,
        context_pattern=r"droit\s+commercial\s+g[ée]n[ée]ral|AUDCG",
        versions=(
            VersionSpec(
                label="1997",
                file=(
                    "akn_aa-ohada_act_1997_droit-commercial-général"
                    "_fra_at_1997-04-17.html"
                ),
                akn_expression_uri=_uri(_W_AUDCG_1997, "1997-04-17"),
                adopted_on=date(1997, 4, 17),
                published_on=date(1997, 10, 1),
                in_force_from=date(1998, 1, 1),
                gazette_reference="J.O. OHADA n° 1, 1er octobre 1997",
            ),
            VersionSpec(
                label="2010",
                file=(
                    "akn_aa-ohada_act_2010_droit-commercial-général"
                    "_fra_at_2011-02-15.html"
                ),
                akn_expression_uri=_uri(_W_AUDCG_2010, "2011-02-15"),
                adopted_on=date(2010, 12, 15),
                published_on=date(2011, 2, 15),
                in_force_from=date(2011, 5, 16),
                gazette_reference="J.O. OHADA, 15 février 2011",
            ),
        ),
    ),
    ActSpec(
        short_code="AUS",
        title="Acte uniforme portant organisation des sûretés",
        akn_work_uri=_W_AUS,
        context_pattern=r"s[ûu]ret[ée]s|\bAUS\b",
        versions=(
            VersionSpec(
                label="2010",
                file=(
                    "akn_aa-ohada_act_2010_organisation-des-sûretés"
                    "_fra_at_2011-02-15.html"
                ),
                akn_expression_uri=_uri(_W_AUS, "2011-02-15"),
                adopted_on=date(2010, 12, 15),
                published_on=date(2011, 2, 15),
                in_force_from=date(2011, 5, 16),
                gazette_reference="J.O. OHADA, 15 février 2011",
            ),
        ),
    ),
    ActSpec(
        short_code="AUSCGIE",
        title=(
            "Acte uniforme relatif au droit des sociétés commerciales et du "
            "groupement d'intérêt économique"
        ),
        akn_work_uri=_W_AUSCGIE,
        context_pattern=(
            r"soci[ée]t[ée]s\s+commerciales|groupement\s+d[’']int[ée]r[êe]t"
            r"\s+[ée]conomique|AUSCGIE"
        ),
        versions=(
            VersionSpec(
                label="2014",
                file=(
                    "akn_aa-ohada_act_2014_sociétés-commerciales-groupement"
                    "-d-intérêt-économique_fra_at_2014-02-04.html"
                ),
                akn_expression_uri=_uri(_W_AUSCGIE, "2014-02-04"),
                adopted_on=date(2014, 1, 30),
                published_on=date(2014, 2, 4),
                in_force_from=date(2014, 5, 5),
                gazette_reference="J.O. OHADA, numéro spécial, 4 février 2014",
            ),
        ),
    ),
    ActSpec(
        short_code="AUSCOOP",
        title="Acte uniforme relatif au droit des sociétés coopératives",
        akn_work_uri=_W_AUSCOOP,
        # "société coopérative X" appears as a party name — require the act
        # to be named.
        context_pattern=r"acte\s+uniforme[^.;]{0,80}coop[ée]rative|\bAUSCOOP\b",
        versions=(
            VersionSpec(
                label="2010",
                file=(
                    "akn_aa-ohada_act_2010_acte-uniforme-relatif-au-droit-des"
                    "-societes-cooperatives_fra_at_2010-12-15.html"
                ),
                akn_expression_uri=_uri(_W_AUSCOOP, "2010-12-15"),
                adopted_on=date(2010, 12, 15),
                published_on=date(2011, 2, 15),
                in_force_from=date(2011, 5, 16),
                gazette_reference="J.O. OHADA, 15 février 2011",
            ),
        ),
    ),
    ActSpec(
        short_code="AUPC",
        title=(
            "Acte uniforme portant organisation des procédures collectives "
            "d'apurement du passif"
        ),
        akn_work_uri=_W_AUPC,
        context_pattern=r"proc[ée]dures\s+collectives|apurement\s+du\s+passif|AUPC",
        versions=(
            VersionSpec(
                label="2015",
                file=(
                    "akn_aa-ohada_act_2015_organisation-des-procédures-collectives"
                    "-d-apurement-du-passif_fra_at_2015-09-25.html"
                ),
                akn_expression_uri=_uri(_W_AUPC, "2015-09-25"),
                adopted_on=date(2015, 9, 10),
                published_on=date(2015, 9, 25),
                in_force_from=date(2015, 12, 24),
                gazette_reference="J.O. OHADA, numéro spécial, 25 septembre 2015",
            ),
        ),
    ),
    ActSpec(
        short_code="AUA",
        title="Acte uniforme relatif au droit de l'arbitrage",
        akn_work_uri=_W_AUA,
        # "arbitrage" alone is in the court's own name (Cour Commune de
        # Justice et d'Arbitrage) — require the act to be named.
        context_pattern=(
            r"acte\s+uniforme[^.;]{0,80}arbitrage"
            r"|droit\s+de\s+l[’']arbitrage|\bAUA\b"
        ),
        versions=(
            VersionSpec(
                label="2017",
                file="akn_aa-ohada_act_2017_droit-de-l-arbitrage_fra_at_2017-12-15.html",
                akn_expression_uri=_uri(_W_AUA, "2017-12-15"),
                adopted_on=date(2017, 11, 23),
                published_on=date(2017, 12, 15),
                in_force_from=date(2018, 3, 15),
                gazette_reference="J.O. OHADA, numéro spécial, 15 décembre 2017",
            ),
        ),
    ),
    ActSpec(
        short_code="AUM",
        title="Acte uniforme relatif à la médiation",
        akn_work_uri=_W_AUM,
        # Court-annexed mediation gets discussed without the act — require
        # the act to be named.
        context_pattern=r"acte\s+uniforme[^.;]{0,80}m[ée]diation|\bAUM\b",
        versions=(
            VersionSpec(
                label="2017",
                file=(
                    "akn_aa-ohada_act_2017_acte-relatif-a-la-mediation"
                    "_fra_at_2017-11-23.html"
                ),
                akn_expression_uri=_uri(_W_AUM, "2017-11-23"),
                adopted_on=date(2017, 11, 23),
                published_on=date(2017, 12, 15),
                in_force_from=date(2018, 3, 15),
                gazette_reference="J.O. OHADA, numéro spécial, 15 décembre 2017",
            ),
        ),
    ),
    ActSpec(
        short_code="AUCTMR",
        title=(
            "Acte uniforme relatif aux contrats de transport de marchandises par route"
        ),
        akn_work_uri=_W_AUCTMR,
        context_pattern=r"transport\s+de\s+marchandises|AUCTMR",
        versions=(
            VersionSpec(
                label="2003",
                file=(
                    "akn_aa-ohada_act_2003_contrats-de-transport-de-marchandises"
                    "-par-route_fra_at_2003-07-31.html"
                ),
                akn_expression_uri=_uri(_W_AUCTMR, "2003-07-31"),
                adopted_on=date(2003, 3, 22),
                published_on=date(2003, 7, 31),
                in_force_from=date(2004, 1, 1),
                gazette_reference="J.O. OHADA n° 13, 31 juillet 2003",
            ),
        ),
    ),
    ActSpec(
        short_code="AUPSRVE",
        title=(
            "Acte uniforme portant organisation des procédures simplifiées "
            "de recouvrement et des voies d'exécution"
        ),
        akn_work_uri=_W_AUPSRVE,
        context_pattern=(
            r"AUPSRVE|voies\s+d[’']ex[ée]cution|proc[ée]dures\s+simplifi[ée]es"
        ),
        versions=(
            # 1998: acquired as a PDF extraction (no AKN source found);
            # loaded by the dedicated PDF path in corpus_load.
            VersionSpec(
                label="1998",
                file=None,
                akn_expression_uri=None,
                adopted_on=date(1998, 4, 10),
                published_on=date(1998, 6, 1),
                in_force_from=date(1998, 7, 10),
                gazette_reference="J.O. OHADA n° 6, 1er juin 1998",
                transitional_rule=TRANSITIONAL_RULE_AUPSRVE_1998,
            ),
            VersionSpec(
                label="2023",
                file=(
                    "akn_aa-ohada_act_2023_organisation-des-procédures-simplifiées"
                    "-de-recouvrement-et-des-voies-d-exécution_fra_at_2024-07-02.html"
                ),
                akn_expression_uri=_uri(_W_AUPSRVE, "2024-07-02"),
                adopted_on=date(2023, 10, 17),
                published_on=date(2023, 11, 15),
                in_force_from=date(2024, 2, 16),
                gazette_reference="J.O. OHADA, numéro spécial, 15 novembre 2023",
            ),
        ),
    ),
)

# The eleventh uniform act — comptabilité et information financière (AUDCIF,
# 2017) — is not on SenLII/Laws.Africa; acquisition from another structured
# source is tracked in docs/corpus-sources.md. It enters this registry the
# day we have a lawful, parseable source, not before.


def version_for_date(act: ActSpec, on: date) -> VersionSpec | None:
    """The version of ``act`` in force on ``on`` (by entry-into-force date).

    Returns None when ``on`` predates every loaded version — an honest gap:
    a 2009 decision citing the 1997 AUSCGIE must not be linked to the 2014
    text. Simplification, documented: targeting uses the *decision* date,
    not the (unknowable from metadata) date proceedings began.
    """
    candidate: VersionSpec | None = None
    for version in sorted(act.versions, key=lambda v: v.in_force_from):
        if version.in_force_from <= on:
            candidate = version
    return candidate
