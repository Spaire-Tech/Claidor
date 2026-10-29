"""The server's sentences in Italian, in "tu" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking, _credentials

WORDS: dict[str, str] = {
    "email.login_code.subject": "Accedi a Simeon",
    **_booking.IT,
    **_account.IT,
    **_credentials.IT,
}
