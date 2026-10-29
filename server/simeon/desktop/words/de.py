"""The server's sentences in German, in "du" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking, _credentials

WORDS: dict[str, str] = {
    "email.login_code.subject": "Bei Simeon anmelden",
    **_booking.DE,
    **_account.DE,
    **_credentials.DE,
}
