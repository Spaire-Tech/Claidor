from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def spa() -> str:
    """A share purchase agreement with defects planted in it.

    Clause 2.1 writes « closing date » for the defined « Closing Date »;
    clause 2.2 refers to an « Escrow Agreement » that is never defined;
    clause 3.2 uses a « Long Stop Date » that is never defined;
    « Company » is defined twice, in clause 1 and at the foot; and
    « Agreement » is used as a defined term throughout without ever being
    defined.

    Everything else in it is correct drafting and must come back clean —
    including the alphabetised definitions clause and the recitals, which
    name terms before clause 1 defines them.
    """
    return (FIXTURES / "share_purchase.txt").read_text(encoding="utf-8")


@pytest.fixture
def vesence_example() -> str:
    """A document built to match Vesence's own published Check panel.

    Their Word page shows five findings in three buckets: two critical
    undefined terms (Completion, New Shares), two warnings (an unused
    « Bank Account » and a twice-defined « Claim »), and one ordering
    issue. This document contains exactly those and nothing else, so the
    clone can be compared against the original rather than against my
    opinion of it.
    """
    return (FIXTURES / "vesence_example.txt").read_text(encoding="utf-8")


@pytest.fixture
def word_blank() -> bytes:
    """A blank document saved by Microsoft Word itself.

    Supplied 2026-08-09. It contains no text, which is exactly why it was
    useful: a blank Word document is a self-closing `<w:p/>`, and that
    found a paragraph-counting bug that would have shifted every offset
    after the first blank line in a real agreement.

    Blank, so there is nothing confidential in it.
    """
    return (FIXTURES / "word_blank.docx").read_bytes()
