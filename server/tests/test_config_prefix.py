"""Settings are read as SIMEON_<NAME>, and the earlier CLAIDOR_<NAME> still
works where the new name is not set, so a deployment keeps running while its
variables are renamed."""

import pytest

from simeon.config import Settings


def test_the_simeon_name_is_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SIMEON_OPENAI_MODEL", "from-simeon")
    assert Settings().OPENAI_MODEL == "from-simeon"


def test_the_claidor_name_is_still_read(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SIMEON_OPENAI_MODEL", raising=False)
    monkeypatch.setenv("CLAIDOR_OPENAI_MODEL", "from-claidor")
    assert Settings().OPENAI_MODEL == "from-claidor"


def test_the_simeon_name_wins_when_both_are_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLAIDOR_OPENAI_MODEL", "from-claidor")
    monkeypatch.setenv("SIMEON_OPENAI_MODEL", "from-simeon")
    assert Settings().OPENAI_MODEL == "from-simeon"


@pytest.mark.parametrize(
    "name",
    ["ANTHROPIC_API_KEY", "SIMEON_ANTHROPIC_API_KEY", "CLAIDOR_ANTHROPIC_API_KEY"],
)
def test_the_anthropic_key_takes_any_of_its_names(
    name: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    for other in (
        "ANTHROPIC_API_KEY",
        "SIMEON_ANTHROPIC_API_KEY",
        "CLAIDOR_ANTHROPIC_API_KEY",
    ):
        monkeypatch.delenv(other, raising=False)
    monkeypatch.setenv(name, "sk-test")
    assert Settings().ANTHROPIC_API_KEY == "sk-test"
