"""Opinion text from CourtListener's bulk export.

The search API hands over metadata without authentication; the opinion
endpoint does not, and an authenticated account is throttled to 125
requests a day. Fetching 419 opinions that way takes four days, and the
whole registry takes weeks. Free Law Project's own guidance for this
volume is the bulk files, so that is what this reads.

The file is **50.8 GB compressed** and is never stored. It is streamed,
decompressed as it arrives, parsed row by row, and discarded — only the
few hundred opinions we asked for are kept. Measured throughput to this
container was 50 MB/s, so a full pass takes something like twenty minutes.

Two format facts were established against the real file, because guessing
either would have produced silent corruption rather than an error:

**The CSV escapes quotes with a backslash, not by doubling them.** Their
export runs ``COPY … WITH (FORMAT csv, ESCAPE '\\\\', FORCE_QUOTE *)``.
Parsed with Python's default ``doublequote=True``, a 12 MB sample yielded
76,172 rows of which **76,151 had the wrong number of fields**. Parsed
with ``escapechar='\\\\'`` it yielded 250 rows and **none** malformed.

**Opinion text contains raw newlines inside quoted fields**, so the file
cannot be processed line by line. It has to go through a real CSV reader
over a stream.
"""

import bz2
import csv
import hashlib
import io
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx
import structlog

from polar.kit.db.postgres import AsyncSession
from polar.models import RegistryOpinion

from .repository import RegistryRepository

log = structlog.get_logger()

BULK_BASE = "https://storage.courtlistener.com/bulk-data"

#: Bulk files are regenerated quarterly, on the last day of March, June,
#: September and December. Pinned rather than computed: which snapshot an
#: opinion came from is part of its provenance, and a date that silently
#: rolls forward makes a run unreproducible.
DEFAULT_SNAPSHOT = "2026-06-30"

#: Opinion text runs to hundreds of kilobytes. Python's CSV reader refuses
#: fields over 128 KB by default, and the failure is an exception mid-file
#: rather than anything a caller would recognise.
CSV_FIELD_LIMIT = 200 * 1024 * 1024

#: Text columns in the order we prefer them. ``plain_text`` is the extracted
#: text; the HTML variants are different editions of the same opinion held
#: by different providers. We take text over markup, and never touch a West
#: or Lexis editorial layer — there is none in this file, which is the point.
#: Order matters, and ``html_with_citations`` is deliberately last: it is
#: CourtListener's own enrichment of one of the other columns, with citation
#: links injected. For a registry that quotes clause wording verbatim, the
#: unmodified source is the one to read.
#:
#: Measured on *Dresser v. Page Petroleum*, where ``plain_text`` is empty:
#: stripping ``xml_harvard`` gave 25,090 characters and
#: ``html_with_citations`` 25,105, the same passage in both. Close enough
#: that either would do, and no reason to prefer the derived one.
TEXT_COLUMNS = (
    "plain_text",
    "html",
    "html_lawbox",
    "html_columbia",
    "html_anon_2020",
    "xml_harvard",
    "html_with_citations",
)


def opinions_url(snapshot: str = DEFAULT_SNAPSHOT) -> str:
    return f"{BULK_BASE}/opinions-{snapshot}.csv.bz2"


class _StreamingBz2(io.RawIOBase):
    """A readable stream of decompressed bytes, fed by an HTTP response.

    Wrapping the decompressor as a file object rather than accumulating
    chunks is what lets :mod:`csv` do the parsing. A hand-rolled splitter
    would have to re-implement quoting and embedded newlines, and would get
    it subtly wrong on exactly the rows that matter.
    """

    def __init__(self, chunks: Iterator[bytes]) -> None:
        self._chunks = chunks
        self._decompressor = bz2.BZ2Decompressor()
        self._buffer = b""
        self._exhausted = False
        self.compressed_bytes = 0

    def readable(self) -> bool:
        return True

    def readinto(self, target) -> int:  # type: ignore[no-untyped-def]
        while not self._buffer and not self._exhausted:
            try:
                chunk = next(self._chunks)
            except StopIteration:
                self._exhausted = True
                break
            self.compressed_bytes += len(chunk)
            self._buffer += self._decompressor.decompress(chunk)

        if not self._buffer:
            return 0
        size = min(len(target), len(self._buffer))
        target[:size] = self._buffer[:size]
        self._buffer = self._buffer[size:]
        return size


def strip_markup(value: str) -> str:
    """Text out of one of the HTML editions.

    Deliberately crude, and only ever a fallback: if ``plain_text`` is
    present we use it. What matters is that the result is checkable
    against the source, so tags go and content stays.
    """
    import re

    without_tags = re.sub(r"(?s)<[^>]+>", " ", value)
    import html as html_module

    unescaped = html_module.unescape(without_tags)
    return re.sub(r"[ \t]{2,}", " ", unescaped).strip()


def text_of(row: dict[str, str]) -> tuple[str, str] | None:
    """The best available text for an opinion, and which column it came from.

    Returns ``None`` when the row carries no text at all — which happens,
    and is worth counting rather than treating as a fetch that succeeded.
    """
    for column in TEXT_COLUMNS:
        value = (row.get(column) or "").strip()
        if not value:
            continue
        text = value if column == "plain_text" else strip_markup(value)
        if text:
            return text, column
    return None


@dataclass
class BulkLoadReport:
    """What a pass over the bulk file actually did."""

    wanted: int = 0
    rows_scanned: int = 0
    matched: int = 0
    stored: int = 0
    empty_text: int = 0
    compressed_bytes: int = 0
    #: Opinions we asked for and the file did not contain. Named, not
    #: counted: a missing opinion is a gap in the corpus and somebody has
    #: to be able to go and look at it.
    missing_ids: list[str] = field(default_factory=list)

    def summary(self) -> str:
        gb = self.compressed_bytes / 1_073_741_824
        return (
            f"{self.stored}/{self.wanted} opinions stored "
            f"({self.rows_scanned:,} rows scanned, {gb:.1f} GB read, "
            f"{self.empty_text} with no text, {len(self.missing_ids)} not found)"
        )


def iter_rows(
    stream: io.RawIOBase,
    wanted_ids: set[str] | None = None,
    on_progress: "Callable[[int], None] | None" = None,
) -> Iterator[dict[str, str]]:
    """Every row of the bulk CSV, as a dict keyed by the header.

    ``wanted_ids`` filters on the id column *before* a dict is built. The
    file holds around ten million opinions and we want a few hundred;
    constructing a twenty-two key dict for each of the rest was most of the
    parsing cost, and parsing is what has to keep up with the download.
    """
    csv.field_size_limit(CSV_FIELD_LIMIT)
    buffered = io.BufferedReader(stream, buffer_size=4 * 1024 * 1024)  # type: ignore[arg-type]
    text = io.TextIOWrapper(buffered, encoding="utf-8", errors="replace", newline="")
    # doublequote=False + escapechar: established against the real file.
    reader = csv.reader(text, doublequote=False, escapechar="\\")
    header = next(reader)
    width = len(header)
    scanned = 0
    for row in reader:
        scanned += 1
        if on_progress is not None and scanned % 250_000 == 0:
            on_progress(scanned)
        if len(row) != width:
            # A width mismatch means the parse has desynchronised. With the
            # wrong escape convention this fires on essentially every row,
            # which is exactly how the convention was established.
            continue
        if wanted_ids is not None and row[0] not in wanted_ids:
            continue
        yield dict(zip(header, row, strict=True))


async def load_texts(
    session: AsyncSession,
    doctrine: str,
    *,
    snapshot: str = DEFAULT_SNAPSHOT,
    limit: int | None = None,
) -> BulkLoadReport:
    """Fill in opinion text for a doctrine's candidates from the bulk file.

    One pass, streamed. Stops early once every wanted opinion is found,
    because the rest of the file is of no use to us and reading it is
    someone else's bandwidth.
    """
    repository = RegistryRepository.from_session(session)
    awaiting = await repository.list_awaiting_text(doctrine, limit=limit or 100_000)
    wanted: dict[str, RegistryOpinion] = {row.source_id: row for row in awaiting}

    report = BulkLoadReport(wanted=len(wanted))
    if not wanted:
        return report

    url = opinions_url(snapshot)
    log.info("registry.bulk.start", url=url, wanted=len(wanted), doctrine=doctrine)

    outstanding = set(wanted)
    # No read timeout. We consume the stream at whatever rate decompression
    # and parsing allow, which measured slightly slower than it arrives; a
    # read deadline turns that ordinary backpressure into a failed run, as
    # it did on the first attempt.
    with httpx.stream(
        "GET", url, timeout=httpx.Timeout(60.0, read=None), follow_redirects=True
    ) as response:
        response.raise_for_status()
        stream = _StreamingBz2(response.iter_bytes(chunk_size=4 * 1024 * 1024))

        def progress(scanned: int) -> None:
            report.rows_scanned = scanned
            log.info(
                "registry.bulk.progress",
                rows=scanned,
                found=report.matched,
                outstanding=len(outstanding),
                gb=round(stream.compressed_bytes / 1_073_741_824, 2),
            )

        for row in iter_rows(
            stream, wanted_ids=outstanding.copy(), on_progress=progress
        ):
            opinion_id = row.get("id")
            if opinion_id not in outstanding:
                continue

            outstanding.discard(opinion_id)
            report.matched += 1
            target = wanted[opinion_id]

            found = text_of(row)
            if found is None:
                report.empty_text += 1
                log.warning("registry.bulk.no_text", opinion=opinion_id)
            else:
                text, column = found
                target.plain_text = text
                target.text_sha256 = hashlib.sha256(text.encode("utf-8")).hexdigest()
                target.text_fetched_at = datetime.now(UTC)
                # The bulk export's type vocabulary differs from the search
                # API's; keep whichever we already have rather than
                # overwriting a known value with another spelling of it.
                if not target.opinion_type:
                    target.opinion_type = row.get("type") or None
                session.add(target)
                report.stored += 1
                log.debug("registry.bulk.stored", opinion=opinion_id, column=column)

            if not outstanding:
                log.info("registry.bulk.complete_early", rows=report.rows_scanned)
                break

        report.compressed_bytes = stream.compressed_bytes

    report.missing_ids = sorted(outstanding)
    await session.flush()
    return report
