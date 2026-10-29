"""The server's sentences in Swedish, in "du" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking, _credentials

WORDS: dict[str, str] = {
    "email.login_code.subject": "Logga in på Simeon",
    **_booking.SV,
    **_account.SV,
    **_credentials.SV,
}
