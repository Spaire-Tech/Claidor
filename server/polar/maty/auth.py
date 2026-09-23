"""Who may speak to the cloud runner's routes.

Nobody, unless they hold `CLAIDOR_MATY_RUNNER_TOKEN`. These routes are
service-to-service: the runner is a process on Claidor's own servers,
not a person, and it must never be possible to reach them with a
person's session, a desktop token or an organization's API key. So this
is not built on `polar.auth` at all — no auth subject is resolved here
and nothing downstream can mistake the caller for a user.

Three things about it, all deliberate:

- the check hangs off the router rather than off each route, so a route
  added later cannot be left open by forgetting a dependency;
- the comparison is `hmac.compare_digest`, so how long a refusal takes
  says nothing about how much of the token was right;
- an empty setting refuses everyone. A missing secret must never read as
  « no secret needed », which is what a plain equality against `""`
  would quietly mean the day the environment variable goes missing.

The runner's *name* is not a credential and does not come from here: it
travels in the request body, where `docs/maties/cloud.md` puts it, and
it is only ever a label on a lease.
"""

import hmac

from fastapi import Request

from polar.config import settings

from .service import MatyRunnerUnauthenticated


def _bearer(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        return token.strip()
    return None


async def authenticate_runner(request: Request) -> None:
    """Let the request through only for Claidor's own cloud runner."""
    expected = settings.MATY_RUNNER_TOKEN
    if not expected:
        raise MatyRunnerUnauthenticated(
            "Simeon is not configured to accept a cloud runner."
        )
    token = _bearer(request)
    if token is None:
        raise MatyRunnerUnauthenticated()
    if not hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8")):
        raise MatyRunnerUnauthenticated()


__all__ = ["authenticate_runner"]
