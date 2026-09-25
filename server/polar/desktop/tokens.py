"""The prefixes of the desktop app's tokens.

Kept in a module with no imports so the auth middleware can recognise a
desktop access token without importing the desktop service.
"""

AUTH_CODE_PREFIX = "claidor_dc_"
ACCESS_TOKEN_PREFIX = "claidor_da_"
REFRESH_TOKEN_PREFIX = "claidor_dr_"
# The credential a person's box renews its access token with (25 September
# 2026); stored in the refresh-token column of a child row.
BOX_CREDENTIAL_PREFIX = "claidor_db_"


def is_desktop_access_token(token: str) -> bool:
    return token.startswith(ACCESS_TOKEN_PREFIX)
