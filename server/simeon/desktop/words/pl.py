"""The server's sentences in Polish, in "ty" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking, _credentials

WORDS: dict[str, str] = {
    "email.login_code.subject": "Zaloguj się do Simeona",
    **_booking.PL,
    **_account.PL,
    **_credentials.PL,
}
