"""The prefixes of the desktop app's tokens.

Kept in a module with no imports so the auth middleware can recognise a
desktop access token without importing the desktop service.
"""

AUTH_CODE_PREFIX = "simeon_dc_"
ACCESS_TOKEN_PREFIX = "simeon_da_"
REFRESH_TOKEN_PREFIX = "simeon_dr_"
# The credential a person's box renews its access token with; stored in the
# refresh-token column of a child row.
BOX_CREDENTIAL_PREFIX = "simeon_db_"

# Tokens are made with the prefixes above. Those issued before the rename
# carry the earlier prefixes and stay valid: a token is found by the hash of
# the whole string, and only these checks read the prefix at all.
ACCESS_TOKEN_PREFIXES = (ACCESS_TOKEN_PREFIX, "claidor_da_")
BOX_CREDENTIAL_PREFIXES = (BOX_CREDENTIAL_PREFIX, "claidor_db_")


def is_desktop_access_token(token: str) -> bool:
    return token.startswith(ACCESS_TOKEN_PREFIXES)


def strip_access_token_prefix(token: str) -> str | None:
    """What follows the access-token prefix, or None when there is none."""
    for prefix in ACCESS_TOKEN_PREFIXES:
        if token.startswith(prefix):
            return token[len(prefix) :]
    return None
