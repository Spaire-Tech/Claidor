"""The person's language, as the iPhone and Mac apps tell it (20 October 2026).

The apps send it on every request (`Accept-Language`, `SimeonAPI` in
`ios/SimeonCore`) and keep it on the account (`POST /desktop/api/user/profile`
with `{"language": "fr"}`, `users.language`), so what is written without a
request, like the sign-in code email, can use it too. English is the source
language: no language, or one Simeon is not translated into, reads as
English. The shop's `customer.locale` and `checkout.locale` are the inherited
checkout's and are not this.
"""

from __future__ import annotations

import re
from contextvars import ContextVar
from typing import Annotated

from fastapi import Depends, Request

#: The longest tag kept ("zh-Hant-TW" is 10; BCP 47 allows more).
LANGUAGE_MAX = 35

_TAG = re.compile(r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$")


def normalize_language(raw: str | None) -> str | None:
    """The tag as kept: "fr", "pt-BR", "zh-Hant"; None for anything that
    is not a language tag. Case as BCP 47 writes it: the language lower,
    a script title, a region upper."""
    if raw is None:
        return None
    value = raw.strip().replace("_", "-")
    if not value or len(value) > LANGUAGE_MAX or not _TAG.match(value):
        return None
    parts = value.split("-")
    out = [parts[0].lower()]
    for part in parts[1:]:
        if len(part) == 4 and part.isalpha():
            out.append(part.title())
        elif len(part) == 2 and part.isalpha():
            out.append(part.upper())
        else:
            out.append(part.lower())
    return "-".join(out)


#: The languages the server answers in besides English: those with a table
#: in `simeon/desktop/words/` (`say`).
TRANSLATED = ("fr", "es", "de", "nl", "it", "pt-BR", "sv", "pl", "tr")

#: The region a language reads when Simeon has only that one: Portuguese is
#: Brazil's ("pt-PT" reads "pt-BR").
ONE_REGION = {"pt": "pt-BR"}

#: The language of the request being answered; None is English.
_current: ContextVar[str | None] = ContextVar("simeon_language", default=None)


def translated(raw: str | None) -> str | None:
    """The language of Simeon's that a tag asks for ("fr" for "fr-CA",
    "pt-BR" for "pt-PT"), or None (English) when Simeon is not translated
    into it."""
    tag = normalize_language(raw)
    if tag is None:
        return None
    if tag in TRANSLATED:
        return tag
    code = tag.split("-")[0].lower()
    if code in TRANSLATED:
        return code
    return ONE_REGION.get(code)


def accepted_language(header: str | None) -> str | None:
    """The first language of an `Accept-Language` Simeon is translated into,
    by its weight ("fr-FR,fr;q=0.9,en;q=0.8" is French); None is English.
    English named before any other reads as English."""
    if not header:
        return None
    ranked: list[tuple[float, int, str]] = []
    for index, part in enumerate(header.split(",")[:20]):
        tag, _, params = part.strip().partition(";")
        weight = 1.0
        for param in params.split(";"):
            name, _, value = param.strip().partition("=")
            if name.strip() == "q":
                try:
                    weight = float(value)
                except ValueError:
                    weight = 0.0
        if tag and tag != "*" and weight > 0:
            ranked.append((-weight, index, tag))
    for _, _, tag in sorted(ranked):
        if normalize_language(tag) is not None and tag.split("-")[0].lower() == "en":
            return None
        language = translated(tag)
        if language is not None:
            return language
    return None


async def answer_in_request_language(request: Request) -> str | None:
    """The routers' dependency: what this request is answered in, from its
    `Accept-Language` (the apps send theirs, the engine the person's). `say`
    reads it for the rest of the request."""
    language = accepted_language(request.headers.get("accept-language"))
    _current.set(language)
    return language


RequestLanguage = Annotated[str | None, Depends(answer_in_request_language)]


def current_language() -> str | None:
    """The language of the request being answered (None is English)."""
    return _current.get()
