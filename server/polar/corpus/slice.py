"""Phase 1 slice constants, importable from app code.

Mirrors scripts/corpus_slice_seed.py (the acquisition-side definition);
app code must not import from scripts/.
"""

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

TRANSITIONAL_RULE_1998 = (
    "Les procédures et mesures d'exécution engagées avant le 16 février 2024 "
    "demeurent régies par l'Acte uniforme du 10 avril 1998 ; l'Acte révisé de "
    "2023 ne s'applique qu'aux procédures engagées à compter de son entrée en "
    "vigueur."
)
