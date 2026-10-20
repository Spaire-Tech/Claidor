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
