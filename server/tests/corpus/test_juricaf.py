from polar.corpus.juricaf import juricaf_ccja_url, parse_juricaf_decision_html

PAGE_MODERN = """
<html><head><title>OHADA, Cour commune de justice et d'arbitrage, 11 mars 2014, 022/2014</title></head>
<body>
<span>urn:lex;ohada;cour.commune.justice.arbitrage;arret;2014-03-11;022.2014</span>
<div>AUPSRVE ; ARTICLE 160,2 ET 335 ; SAISIE-ATTRIBUTION DE CREANCES ; DELAI DE CONTESTATION ; CASSATION</div>
<p>Cour commune de justice et d'arbitrage — Arrêt n° 022/2014.</p>
<p>Sur le moyen unique de cassation…</p>
<footer>Juricaf est un service de l'AHJUCAF</footer>
</body></html>
"""

PAGE_LEGACY_URN = """
<html><head><title>OHADA, Cour commune de justice et d'arbitrage, 10 juin 2010, 038</title></head>
<body>
<span>urn:lex;ohada;cour.commune.justice.arbitrage;arret;2010-06-10;038</span>
<p>Cour commune de justice et d'arbitrage — arrêt.</p>
<footer>Juricaf est un service de l'AHJUCAF</footer>
</body></html>
"""


def test_deterministic_url() -> None:
    assert juricaf_ccja_url("022/2014", "2014-03-11") == (
        "https://juricaf.org/arret/"
        "OHADA-COURCOMMUNEDEJUSTICEETDARBITRAGE-20140311-0222014"
    )


def test_parse_modern_urn() -> None:
    d = parse_juricaf_decision_html(PAGE_MODERN)
    assert d.number == "022/2014"
    assert d.decided_on == "2014-03-11"
    assert d.urn_lex is not None
    assert d.urn_lex.endswith("022.2014")
    assert d.keyword_header is not None
    assert "ARTICLE 160,2 ET 335" in d.keyword_header
    assert "moyen unique" in d.full_text


def test_parse_legacy_urn_without_year_suffix() -> None:
    d = parse_juricaf_decision_html(PAGE_LEGACY_URN)
    assert d.number == "038/2010"
    assert d.decided_on == "2010-06-10"
