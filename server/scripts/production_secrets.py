"""Generate every secret a Claidor production deploy needs, once.

Usage: ``uv run python -m scripts.production_secrets``

Prints ready-to-paste environment lines. Nothing is written to disk and
nothing is logged — copy the output into Render's dashboard, then close the
terminal. Re-running produces different values: generate once, and keep
them, because rotating ``CLAIDOR_SECRET`` signs every existing session out
and rotating the JWKS invalidates issued tokens.

Only the values the code actually reads are produced here. (There is no
encryption key in this codebase — if a guide told you otherwise, it was
describing a different product.)
"""

import secrets

from polar.kit.jwk import generate_jwks

KID = "claidor_prod"


def main() -> None:
    jwks = generate_jwks(KID)
    print("# --- Claidor production secrets — generate once, keep safe ---")
    print(f"CLAIDOR_SECRET={secrets.token_urlsafe(48)}")
    print(f"CLAIDOR_S3_FILES_DOWNLOAD_SECRET={secrets.token_urlsafe(48)}")
    print(f"CLAIDOR_CURRENT_JWK_KID={KID}")
    # Single line on purpose: Render's dashboard takes one value per field.
    print(f"CLAIDOR_JWKS={jwks}")
    print()
    print("# Paste into Render → claidor-api → Environment.")
    print("# CLAIDOR_SECRET rotation signs everyone out; JWKS rotation")
    print("# invalidates issued tokens. Generate once.")


if __name__ == "__main__":
    main()
