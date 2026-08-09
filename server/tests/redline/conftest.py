from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def spa() -> str:
    """A share purchase agreement with three planted defects.

    Clause 2.1 writes « closing date » for the defined « Closing Date »;
    clause 2.2 refers to an « Escrow Agreement » that is never defined; and
    « Company » is defined twice, in clause 1 and at the foot.

    Everything else in it is correct drafting and must come back clean.
    """
    return (FIXTURES / "share_purchase.txt").read_text(encoding="utf-8")
