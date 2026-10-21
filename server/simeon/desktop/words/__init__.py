"""The server's sentences in the person's language (20 October 2026,
docs/localization.md): the refusals and answers the apps, the engine and
the sign-in email show as they come.

    say("flight.not_switched_on")                    # the request's language
    say("email.login_code.subject", language="fr")   # no request (a task)
    say("flight.not_booked", why=reason)             # "{why}" in the sentence

English is the source (`en.py`); each translation is a table with the same
keys (`fr.py` in "tu", `es.py` in "tú"). A request's language is its
`Accept-Language` (`language.answer_in_request_language`, on the apps'
routers); none, or one Simeon is not translated into, reads as English. A
missing key or value is the English, and `tests/desktop/test_words.py`
fails on it.
"""

from __future__ import annotations

import re

from ..language import current_language, translated
from . import de, en, es, fr, it, nl, pl, pt_BR, sv, tr

#: Each translation by language; English is `en.WORDS`.
TABLES: dict[str, dict[str, str]] = {
    "fr": fr.WORDS,
    "es": es.WORDS,
    "de": de.WORDS,
    "nl": nl.WORDS,
    "it": it.WORDS,
    "pt-BR": pt_BR.WORDS,
    "sv": sv.WORDS,
    "pl": pl.WORDS,
    "tr": tr.WORDS,
}

_VALUE = re.compile(r"\{(\w+)\}")


def say(key: str, /, *, language: str | None = None, **values: object) -> str:
    """The sentence `key` in `language` (the request's when not given), with
    each `{name}` filled from `values`."""
    tag = translated(language) if language is not None else current_language()
    table = TABLES.get(tag or "", {})
    template = table.get(key) or en.WORDS[key]
    return _VALUE.sub(
        lambda found: str(values[found.group(1)])
        if found.group(1) in values
        else found.group(0),
        template,
    )


__all__ = ["TABLES", "say"]
