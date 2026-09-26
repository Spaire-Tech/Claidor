"""The desktop app's sign-in and token routes are rate-limited (F-257,
25 September 2026). The middleware only mounts in production and sandbox,
so this reads the rule tables it would mount."""

from polar.rate_limit import _PRODUCTION_RULES, _SANDBOX_RULES


def test_desktop_sign_in_and_token_routes_carry_rules() -> None:
    for rules in (_PRODUCTION_RULES, _SANDBOX_RULES):
        for path in ("^/loginDeepControl", "^/auth/poll", "^/oauth/token", "^/desktop/api/auth/refresh", "^/desktop/api/feedback"):
            assert path in rules, path
            assert all(rule.zone.startswith("desktop-") for rule in rules[path]), path
        # A sign-in polls under 60 times a minute (1 s to 10 s back-off), so the
        # poll's minute allowance leaves room for two people behind one address.
        assert _PRODUCTION_RULES["^/auth/poll"][0].minute >= 120
