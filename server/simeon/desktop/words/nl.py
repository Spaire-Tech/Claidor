"""The server's sentences in Dutch, in "je" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking, _credentials

WORDS: dict[str, str] = {
    "email.login_code.subject": "Log in bij Simeon",
    **_booking.NL,
    **_account.NL,
    **_credentials.NL,
}
