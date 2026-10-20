"""The server's sentences in French, in "tu" (`say`, docs/localization.md).

The same keys as `en.py`, with the same `{name}` values.
"""

from . import _account, _booking

WORDS: dict[str, str] = {
    "email.login_code.subject": "Connecte-toi à Simeon",
    **_booking.FR,
    **_account.FR,
}
