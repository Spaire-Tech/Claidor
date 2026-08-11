"""The `state` that crosses the OAuth redirect, signed.

**The state is a credential, not a nonce.** The browser coming back from
Microsoft may not carry a session cookie at all — a cross-site redirect
and `SameSite` see to that, which is the same trap the panel's token flow
was written around. So the state has to say, by itself and unforgeably,
which organization is being connected and by whom.

Signed with the server's own secret and stamped with a time. It cannot be
edited, it cannot be replayed after ten minutes, and it can only have been
minted by the route that required a web session to mint it.
"""

import hashlib
import hmac
import json
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode

from polar.config import settings

#: How long a redirect is good for. Long enough to sign in to Microsoft
#: and pick an account, short enough that one left in a browser history is
#: not a way in.
LIFETIME = 600


def sign(claims: dict[str, str]) -> str:
    payload = {**claims, "at": int(time.time())}
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    body = urlsafe_b64encode(raw).rstrip(b"=")
    return f"{body.decode()}.{_mac(body)}"


def unsign(state: str) -> dict[str, str]:
    """The claims, or :class:`ValueError`. Never a partial answer."""
    try:
        body, signature = state.split(".", 1)
    except ValueError as problem:
        raise ValueError("malformed state") from problem

    encoded = body.encode()
    # `compare_digest`, because a signature check that returns early on the
    # first wrong byte is a signature check that can be guessed a byte at a
    # time.
    if not hmac.compare_digest(_mac(encoded), signature):
        raise ValueError("state signature does not match")

    padded = encoded + b"=" * (-len(encoded) % 4)
    claims = json.loads(urlsafe_b64decode(padded))
    if not isinstance(claims, dict):
        raise ValueError("state is not a set of claims")
    if time.time() - float(claims.get("at", 0)) > LIFETIME:
        raise ValueError("state has expired")
    return {key: str(value) for key, value in claims.items()}


def _mac(body: bytes) -> str:
    return hmac.new(
        settings.SECRET.encode(), b"connector:" + body, hashlib.sha256
    ).hexdigest()


__all__ = ["LIFETIME", "sign", "unsign"]
