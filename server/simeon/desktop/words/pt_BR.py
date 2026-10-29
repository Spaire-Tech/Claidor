"""The server's sentences in Brazilian Portuguese, in "você" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking, _credentials

WORDS: dict[str, str] = {
    "email.login_code.subject": "Entre no Simeon",
    **_booking.PT_BR,
    **_account.PT_BR,
    **_credentials.PT_BR,
}
