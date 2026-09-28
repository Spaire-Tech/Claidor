"""The name Google gives at sign-in is kept and reaches the desktop's profile
route, so the agent can greet the person by it (28 September 2026)."""

from polar.desktop.service import desktop
from polar.integrations.google.service import GoogleUserProfile, remember_google_name
from polar.models import User


def _profile(name: str | None, given: str | None) -> GoogleUserProfile:
    return {
        "id": "g1",
        "email": "bass@example.com",
        "email_verified": True,
        "picture": None,
        "name": name,
        "given_name": given,
    }


def test_the_name_is_kept_and_served() -> None:
    user = User(email="bass@example.com", meta={"other": 1})
    remember_google_name(user, _profile("Bass Fall", "Bass"))
    assert user.meta == {"other": 1, "name": "Bass Fall", "given_name": "Bass"}
    payload = desktop.user_payload(user)
    assert payload["name"] == "Bass Fall"
    assert payload["email"] == "bass@example.com"


def test_no_name_changes_nothing() -> None:
    user = User(email="bass@example.com", meta={})
    remember_google_name(user, _profile(None, None))
    assert user.meta == {}
    assert "name" not in desktop.user_payload(user)
