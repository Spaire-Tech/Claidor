"""Repository contract tests.

Regression for the launch-day crash: the actors call `get_by_id`, which
lives in RepositorySoftDeletionIDMixin — a mixin the repository originally
forgot to inherit, so every fast_pass died with AttributeError and analyses
sat in 'queued' forever. These run in CI (they import the app models).
"""

from polar.masterclass_architect.repository import (
    MasterclassArchitectAnalysisRepository,
)


def test_repository_has_get_by_id() -> None:
    assert hasattr(MasterclassArchitectAnalysisRepository, "get_by_id")


def test_repository_has_soft_deletion() -> None:
    assert hasattr(MasterclassArchitectAnalysisRepository, "soft_delete")
