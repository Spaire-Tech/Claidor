"""The server's sentences in English, the source language (`say`).

A key names where the sentence is said; `{name}` is a value filled in.
Each translation (`fr.py`) has the same keys and the same values.
"""

from . import _account, _booking

WORDS: dict[str, str] = {
    # The sign-in code email's subject (`login_code.service.send`).
    "email.login_code.subject": "Sign in to Simeon",
    **_booking.EN,
    **_account.EN,
}
