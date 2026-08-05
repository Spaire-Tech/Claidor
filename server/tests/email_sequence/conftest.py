# Local overrides so the enrollment-trigger verification can run without the
# S3/minio and external services it never touches.
from collections.abc import Iterable
from typing import Any

import pytest


@pytest.fixture(scope="session", autouse=True)
def empty_test_bucket() -> Iterable[Any]:  # overrides tests/fixtures/file.py
    yield
