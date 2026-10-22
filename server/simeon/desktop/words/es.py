"""The server's sentences in Spanish, in "tú" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking

WORDS: dict[str, str] = {
    "email.login_code.subject": "Inicia sesión en Simeon",
    **_booking.ES,
    **_account.ES,
}
