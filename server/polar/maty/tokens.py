"""Where the cloud runner's routes live.

Kept in a module with no imports so the auth middleware can recognise a
runner request without importing the maty service — the same reason
`polar.desktop.tokens` exists.

The middleware needs to know because `/maty/runner` is
service-to-service: it carries the runner's own bearer token, which is a
shared secret belonging to no person and matching none of the token
shapes `polar.auth` knows. Without this, an unrecognised bearer would
become an OAuth2 error before the routes could look at it, and a wrong
runner token would be refused with the wrong reason.
"""

RUNNER_PATH_PREFIX = "/maty/runner"


def is_runner_path(path: str) -> bool:
    return path == RUNNER_PATH_PREFIX or path.startswith(f"{RUNNER_PATH_PREFIX}/")
