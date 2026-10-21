"""The server's sentences in Turkish, in "sen" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking

WORDS: dict[str, str] = {
    "email.login_code.subject": "Simeon’a giriş yap",
    **_booking.TR,
    **_account.TR,
}
