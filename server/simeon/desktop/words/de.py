"""The server's sentences in German, in "du" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking

WORDS: dict[str, str] = {
    "email.login_code.subject": "Bei Simeon anmelden",
    **_booking.DE,
    **_account.DE,
}
