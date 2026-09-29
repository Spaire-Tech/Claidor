"""Generate every secret a Simeon production deploy needs, once.

Usage: ``uv run python -m scripts.production_secrets``

Prints ready-to-paste environment lines. Nothing is written to disk and
nothing is logged — copy the output into Render's dashboard, then close the
terminal. Re-running produces different values: generate once, and keep
them, because rotating ``SIMEON_SECRET`` signs every existing session out
and rotating the JWKS invalidates issued tokens.

Only the values the code actually reads are produced here. (There is no
encryption key in this codebase — if a guide told you otherwise, it was
describing a different product.)
"""

import secrets

from simeon.kit.jwk import generate_jwks

KID = "simeon_prod"


def main() -> None:
    jwks = generate_jwks(KID)
    print("# --- Simeon production secrets — generate once, keep safe ---")
    print(f"SIMEON_SECRET={secrets.token_urlsafe(48)}")
    print(f"SIMEON_S3_FILES_DOWNLOAD_SECRET={secrets.token_urlsafe(48)}")
    print(f"SIMEON_CURRENT_JWK_KID={KID}")
    # Single line on purpose: Render's dashboard takes one value per field.
    print(f"SIMEON_JWKS={jwks}")
    print()
    print("# Paste into Render → the API service → Environment.")
    print("# SIMEON_SECRET rotation signs everyone out; JWKS rotation")
    print("# invalidates issued tokens. Generate once.")


if __name__ == "__main__":
    main()
