"""The Chain — from source document to model cell, one link at a time.

Track D of the plan. The tie-out engine already walks model → deck; this
package walks the other direction, document → model: what did the term
sheet actually say, where exactly did it say it, and which typed cell
rests on it. Its links, in order of construction:

- **D1, extraction** (`extract`): every number in a PDF with page and
  highlight box; scans refused in words. Built first because every
  later link cites through it.
- **D2, the fact store**: fact id ⇒ page + box, served — its contract
  is proposed as a JSON schema in the lane log before any database
  exists.
- **D3 onward**: link proposal, confirm-once, the unsourced-number
  finding — per `docs/pierce/swens-plan.md`.

The engine (`polar.tieout`'s modules) is a read-only library from in
here; this package never changes what the engine reports. Its router
(`router.py`) is mounted by the lead at integration.
"""

from .extract import (
    Box,
    ExtractedNumber,
    Extraction,
    PageSize,
    RefusedPage,
    extract_pdf,
    parse_number,
)

__all__ = [
    "Box",
    "ExtractedNumber",
    "Extraction",
    "PageSize",
    "RefusedPage",
    "extract_pdf",
    "parse_number",
]
