"""The server's sentences in the person's language (20 October 2026,
docs/localization.md): a request is answered in its `Accept-Language`, an
email in the language it is given, and English, or none, reads as before."""

import re

import pytest

from simeon.desktop.language import TRANSLATED, accepted_language, translated
from simeon.desktop.words import TABLES, en, say

VALUE = re.compile(r"\{(\w+)\}")
#: A French sentence has a narrow no-break space before : ; ! ? and none of these.
LOOSE_SPACE = re.compile(r"[  ][:;!?](\s|$)")


def test_accept_language_picks_the_first_language_simeon_is_in() -> None:
    assert accepted_language("fr") == "fr"
    assert accepted_language("fr-CA") == "fr"
    assert accepted_language("fr-FR,fr;q=0.9,en;q=0.8") == "fr"
    assert accepted_language("ja-JP,fr;q=0.7") == "fr", "Japanese is not one yet"
    assert accepted_language("en-US,fr;q=0.5") is None, "English named first"
    assert accepted_language("en;q=0.2,fr;q=0.9") == "fr", "by weight"
    assert accepted_language("fr;q=0") is None
    for nothing in [None, "", "*", "ja", "garbage;;", "x" * 80]:
        assert accepted_language(nothing) is None, nothing
    assert translated("fr-CA") == "fr"
    # Spanish (21 October 2026): Mexico's, Spain's and Latin America's all read the one Spanish.
    assert accepted_language("es") == "es"
    assert accepted_language("es-MX,es;q=0.9") == "es"
    assert accepted_language("es-419,es;q=0.9,en;q=0.8") == "es"
    assert accepted_language("ja-JP,es-ES;q=0.8,fr;q=0.7") == "es", "by order"
    assert translated("es-ES") == "es"
    # The later languages (21 October 2026); Portugal's Portuguese reads Brazil's.
    assert accepted_language("de-DE,de;q=0.9,en;q=0.8") == "de"
    assert accepted_language("de-AT") == "de"
    assert accepted_language("nl-BE") == "nl"
    assert accepted_language("it-IT") == "it"
    assert accepted_language("sv-SE") == "sv"
    assert accepted_language("pl-PL") == "pl"
    assert accepted_language("tr-TR") == "tr"
    assert accepted_language("pt-BR") == "pt-BR"
    assert accepted_language("pt-PT,pt;q=0.9") == "pt-BR"
    assert translated("pt") == "pt-BR"
    assert translated("pt-br") == "pt-BR"


def test_every_table_is_a_language_the_server_answers_in() -> None:
    assert set(TABLES) == set(TRANSLATED)


def test_a_sentence_is_english_unless_a_language_is_asked_for() -> None:
    assert say("email.login_code.subject") == "Sign in to Simeon"
    assert say("email.login_code.subject", language="en") == "Sign in to Simeon"
    assert say("email.login_code.subject", language="fr") == "Connecte-toi à Simeon"
    assert say("email.login_code.subject", language="fr-CA") == "Connecte-toi à Simeon"
    assert say("email.login_code.subject", language="ja") == "Sign in to Simeon"
    assert say("email.login_code.subject", language="es") == "Inicia sesión en Simeon"
    assert (
        say("email.login_code.subject", language="es-MX") == "Inicia sesión en Simeon"
    )
    for language in ("de", "nl", "it", "pt-BR", "sv", "pl", "tr"):
        subject = say("email.login_code.subject", language=language)
        assert subject == TABLES[language]["email.login_code.subject"], language
        assert subject != "Sign in to Simeon", language
    assert say("email.login_code.subject", language="pt-PT") == say(
        "email.login_code.subject", language="pt-BR"
    )


def test_each_translation_has_every_sentence_with_its_values() -> None:
    for language, table in TABLES.items():
        assert set(table) == set(en.WORDS), language
        for key, english in en.WORDS.items():
            assert set(VALUE.findall(table[key])) == set(VALUE.findall(english)), (
                language,
                key,
            )
            assert table[key].strip(), (language, key)


def test_french_typography() -> None:
    for key, sentence in TABLES["fr"].items():
        assert not LOOSE_SPACE.search(sentence), (key, sentence)
        assert "'" not in sentence, (key, "the apostrophe is ’")


def test_spanish_punctuation() -> None:
    """¿ and ¡ open what ? and ! close, “ ” for quotes, nothing French."""
    for key, sentence in TABLES["es"].items():
        assert "\u202f" not in sentence, (key, sentence)
        assert "«" not in sentence, (key, sentence)
        assert not re.search(r"\s[:;!?]", sentence), (key, sentence)
        assert "'" not in sentence, (key, sentence)
        assert sentence.count("?") == sentence.count("¿"), (key, sentence)
        assert sentence.count("!") == sentence.count("¡"), (key, sentence)


def test_values_fill_their_places() -> None:
    english = next((key for key, text in en.WORDS.items() if VALUE.search(text)), None)
    if english is None:
        pytest.skip("no sentence with a value yet")
    names = VALUE.findall(en.WORDS[english])
    filled = say(english, **{name: f"<{name}>" for name in names})
    for name in names:
        assert f"<{name}>" in filled


def test_the_later_languages_typography() -> None:
    """No French spacing or quotes, the curly apostrophe, no space before : ; ! ?."""
    for language in ("de", "nl", "it", "pt-BR", "sv", "pl", "tr"):
        for key, sentence in TABLES[language].items():
            assert "\u202f" not in sentence, (language, key, sentence)
            assert "«" not in sentence, (language, key)
            assert "»" not in sentence, (language, key)
            assert not re.search(r"\s[:;!?](\s|$)", sentence), (language, key, sentence)
            assert "'" not in sentence, (language, key, "the apostrophe is ’")
