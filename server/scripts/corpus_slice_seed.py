"""Phase 1 slice definition: saisie-attribution des créances (AUPSRVE).

Static seed data for the corpus loader. This file intentionally contains no
article *text* — texts enter the database only from acquired authoritative
sources (see docs/corpus-sources.md); this module just pins down WHAT belongs
in the slice and the decision seeds found in the acquisition pass.

Loaded by the (forthcoming) corpus ingestion pipeline; import-light on
purpose so it can be consumed anywhere.
"""

from dataclasses import dataclass, field

AUPSRVE_SHORT_CODE = "AUPSRVE"

AKN_WORK_URI_2023 = (
    "/akn/aa-ohada/act/2023/"
    "organisation-des-procédures-simplifiées-de-recouvrement"
    "-et-des-voies-d-exécution"
)
AKN_EXPRESSION_URI_2023 = f"{AKN_WORK_URI_2023}/fra@2024-07-02"

TRANSITIONAL_RULE_1998 = (
    "Les procédures et mesures d'exécution engagées avant le 16 février 2024 "
    "demeurent régies par l'Acte uniforme du 10 avril 1998 ; l'Acte révisé de "
    "2023 ne s'applique qu'aux procédures engagées à compter de son entrée en "
    "vigueur."
)

# 1998-act articles in the slice. 49 is included because the CCJA repeatedly
# holds it is displaced by 172 for saisie-attribution appeals (special text
# over general — settled since arrêts 003/2005 and 054/2005); 335–337 are the
# transitional/final provisions.
SLICE_ARTICLES_1998: list[str] = [
    "49",
    "153",
    "156",
    "157",
    "158",
    "160",
    "164",
    "166",
    "168",
    "169",
    "170",
    "171",
    "172",
    "335",
    "336",
    "337",
]


@dataclass(frozen=True)
class SeedDecision:
    """A CCJA decision known (pre-verification) to belong to the slice."""

    number: str
    decided_on: str  # ISO date
    articles_1998: list[str] = field(default_factory=list)
    note: str = ""
    ohadata_code: str | None = None
    chamber: str | None = None
    demo_highlight: bool = False


# Nearly all seeds interpret the 1998 text — the 2023 act has almost no case
# law yet, which is exactly why version tagging and the equivalence map carry
# the demo. Every entry ships as status='proposed' and must be verified
# against the decision body before it enters the graph.
SEED_DECISIONS: list[SeedDecision] = [
    SeedDecision(
        number="221/2025",
        decided_on="2025-07-10",
        articles_1998=["168"],
        note=(
            "Paiement par le tiers saisi : définitif et libératoire. Récent, "
            "très commenté — pièce maîtresse de la démo."
        ),
        demo_highlight=True,
    ),
    SeedDecision(
        number="090/2018",
        decided_on="2018-04-26",
        chamber="1re ch.",
        articles_1998=["160", "335"],
        note="Contestation hors délai (art. 160 al. 2) ; cassation.",
    ),
    SeedDecision(
        number="026/2016",
        decided_on="2016-02-25",
        articles_1998=["170"],
        note="Seul le débiteur saisi peut contester et demander mainlevée.",
    ),
    SeedDecision(
        number="101/2015",
        decided_on="2015-07-23",
        articles_1998=["157", "166", "169"],
        note="Mentions de l'acte de saisie ; désignation d'un séquestre.",
        ohadata_code="J-16-198",
    ),
    SeedDecision(
        number="022/2014",
        decided_on="2014-03-11",
        articles_1998=["160", "335"],
        note="Erreur de calcul dans l'acte de saisie : pas de nullité.",
    ),
    SeedDecision(
        number="101/2014",
        decided_on="2014-11-04",
        articles_1998=["49"],
        note="Portée de l'art. 49 (juge de l'exécution).",
    ),
    SeedDecision(
        number="001/2013",
        decided_on="2013-03-07",
        articles_1998=["172", "49"],
        note="Art. 172 prime l'art. 49 pour les délais d'appel.",
    ),
    SeedDecision(
        number="025/2010",
        decided_on="2010-04-08",
        articles_1998=["157"],
        note="Nullité des actes de saisie et de dénonciation.",
    ),
    SeedDecision(
        number="038/2010",
        decided_on="2010-06-10",
        articles_1998=["157"],
        note="Mauvaise application de l'art. 157, al. 1.",
    ),
    SeedDecision(
        number="054/2005",
        decided_on="2005-12-15",
        articles_1998=["172", "49"],
        note="Paire fondatrice 172 vs 49 (avec 003/2005).",
    ),
    SeedDecision(
        number="003/2005",
        decided_on="2005-01-27",
        articles_1998=["172", "49"],
        note="Paire fondatrice 172 vs 49 (avec 054/2005).",
    ),
]


def juricaf_url(number: str, decided_on: str) -> str:
    """Deterministic Juricaf URL for a CCJA decision.

    ``022/2014`` on 2014-03-11 →
    ``…-COURCOMMUNEDEJUSTICEETDARBITRAGE-20140311-0222014``.
    """
    num, year = number.split("/")
    return (
        "https://juricaf.org/arret/OHADA-COURCOMMUNEDEJUSTICEETDARBITRAGE-"
        f"{decided_on.replace('-', '')}-{num}{year}"
    )
