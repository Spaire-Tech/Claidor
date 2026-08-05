from polar.corpus.akn import (
    article_sort_key,
    normalize_article_number,
    parse_lawsafrica_act_html,
)

SAMPLE = """
<html><body>
<h1>Acte Uniforme Test</h1>
<section class="akn-article" data-eId="chp_1__art_premier">
  <h2>Article premier</h2>
  <span class="akn-content">
    <span class="akn-p">Premier alinéa.</span>
    <span class="akn-p">Deuxième&nbsp;alinéa.</span>
  </span>
</section>
<section class="akn-article" data-eId="chp_2__art_157-1">
  <h2>Article 157-1</h2>
  <span class="akn-p">Texte de l'article 157-1.</span>
</section>
<section class="akn-article" data-eId="chp_2__art_158">
  <h2>Article 158</h2>
  <span class="akn-p">Texte de l'article 158.</span>
</section>
</body></html>
"""


def test_normalize_article_number() -> None:
    assert normalize_article_number("Article premier") == "1"
    assert normalize_article_number("Article 157-1") == "157-1"
    assert normalize_article_number("premier-1") == "1-1"
    assert normalize_article_number("Article 338.") == "338"


def test_sort_key_orders_compound_numbers() -> None:
    numbers = ["158", "157", "157-3", "157-1"]
    assert sorted(numbers, key=article_sort_key) == ["157", "157-1", "157-3", "158"]


def test_parse_sample_act() -> None:
    act = parse_lawsafrica_act_html(SAMPLE)
    assert act.title == "Acte Uniforme Test"
    assert [a.number for a in act.articles] == ["1", "157-1", "158"]
    first = act.articles[0]
    assert first.akn_eid == "chp_1__art_premier"
    assert first.alineas == ["Premier alinéa.", "Deuxième alinéa."]
    assert first.text == "Premier alinéa.\nDeuxième alinéa."


def test_real_acquired_file_when_present() -> None:
    from pathlib import Path

    path = (
        Path(__file__).parents[3]
        / "corpus"
        / "raw"
        / "senlii-aupsrve-2023-fra@2024-07-02.html"
    )
    if not path.exists():
        return
    act = parse_lawsafrica_act_html(path.read_text(encoding="utf-8"))
    numbers = [a.number for a in act.articles]
    assert len(numbers) == len(set(numbers))
    assert "45" in numbers
    assert "338" in numbers
    assert len(act.articles) == 448
