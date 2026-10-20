"""The server's sentences in the person's language (20 October 2026,
docs/localization.md): a request is answered in its `Accept-Language`, an
email in the language it is given, and English, or none, reads as before."""

import re

import httpx
import pytest

from simeon.desktop.language import accepted_language, translated
from simeon.desktop.words import TABLES, en, say

VALUE = re.compile(r"\{(\w+)\}")
#: A French sentence has a narrow no-break space before : ; ! ? and none of these.
LOOSE_SPACE = re.compile(r"[  ][:;!?](\s|$)")


def test_accept_language_picks_the_first_language_simeon_is_in() -> None:
    assert accepted_language("fr") == "fr"
    assert accepted_language("fr-CA") == "fr"
    assert accepted_language("fr-FR,fr;q=0.9,en;q=0.8") == "fr"
    assert accepted_language("de-DE,fr;q=0.7") == "fr", "German is not one yet"
    assert accepted_language("en-US,fr;q=0.5") is None, "English named first"
    assert accepted_language("en;q=0.2,fr;q=0.9") == "fr", "by weight"
    assert accepted_language("fr;q=0") is None
    for nothing in [None, "", "*", "de", "garbage;;", "x" * 80]:
        assert accepted_language(nothing) is None, nothing
    assert translated("pt-BR") is None
    assert translated("fr-CA") == "fr"


def test_a_sentence_is_english_unless_a_language_is_asked_for() -> None:
    assert say("email.login_code.subject") == "Sign in to Simeon"
    assert say("email.login_code.subject", language="en") == "Sign in to Simeon"
    assert say("email.login_code.subject", language="fr") == "Connecte-toi à Simeon"
    assert say("email.login_code.subject", language="fr-CA") == "Connecte-toi à Simeon"
    assert say("email.login_code.subject", language="ja") == "Sign in to Simeon"


def test_each_translation_has_every_sentence_with_its_values() -> None:
    for language, table in TABLES.items():
        assert set(table) == set(en.WORDS), language
        for key, english in en.WORDS.items():
            assert set(VALUE.findall(table[key])) == set(VALUE.findall(english)), (language, key)
            assert table[key].strip(), (language, key)


def test_french_typography() -> None:
    for key, sentence in TABLES["fr"].items():
        assert not LOOSE_SPACE.search(sentence), (key, sentence)
        assert "'" not in sentence, (key, "the apostrophe is ’")


def test_values_fill_their_places() -> None:
    english = next((key for key, text in en.WORDS.items() if VALUE.search(text)), None)
    if english is None:
        pytest.skip("no sentence with a value yet")
    names = VALUE.findall(en.WORDS[english])
    filled = say(english, **{name: f"<{name}>" for name in names})
    for name in names:
        assert f"<{name}>" in filled
