"""The corpus must read the same on every machine.

This is not a hypothetical. Four CCJA avis consultatifs were read as
ordinary judgments on the production container and as avis on a laptop,
from byte-identical files, because one script decoded them with the
platform's preferred encoding instead of UTF-8. The corpus is French; a
pipeline whose output depends on the ambient locale is not a pipeline.
"""

import re
from pathlib import Path

from polar.corpus.juricaf import parse_juricaf_decision_html
from polar.corpus.sources import read_corpus_text

SCRIPTS = Path(__file__).parent.parent.parent / "scripts"
CORPUS_SCRIPTS = sorted(SCRIPTS.glob("corpus_*.py"))

#: ``read_text()`` and bare ``open()`` both ask the platform what encoding
#: to use. Neither belongs anywhere near an acquired source file.
LOCALE_DEPENDENT = re.compile(r"\.read_text\(\s*(?!.*encoding=)|(?<![\w.])open\(")

ACCENTED = "Rendu en séance plénière — avis n° 003/2015."

DECISIONS = Path(__file__).parent.parent.parent.parent / "corpus" / "raw" / "decisions"
#: One of the four that regressed on the server.
AVIS_FILE = (
    DECISIONS / "juricaf-OHADA-COURCOMMUNEDEJUSTICEETDARBITRAGE-20151105-0032015.html"
)


class TestExplicitDecoding:
    def test_utf8_is_used_whatever_the_platform_prefers(self, tmp_path) -> None:
        path = tmp_path / "decision.html"
        path.write_bytes(ACCENTED.encode("utf-8"))
        assert "séance plénière" in read_corpus_text(path)
        assert "�" not in read_corpus_text(path)

    def test_an_undecodable_byte_costs_one_character_not_the_file(
        self, tmp_path
    ) -> None:
        path = tmp_path / "decision.html"
        path.write_bytes("séance".encode() + b"\xff" + b" plenary")
        text = read_corpus_text(path)
        assert text.startswith("séance")
        assert text.endswith(" plenary")


class TestNoLocaleDependentReads:
    def test_no_corpus_script_reads_a_file_through_the_locale(self) -> None:
        # A grep as a test, deliberately: the failure it guards against is
        # invisible in every unit test, because the test machine has a
        # locale and the server does not.
        offenders = []
        for script in CORPUS_SCRIPTS:
            for number, line in enumerate(
                script.read_text(encoding="utf-8").splitlines(), 1
            ):
                if LOCALE_DEPENDENT.search(line):
                    offenders.append(f"{script.name}:{number}: {line.strip()}")
        assert offenders == [], (
            "corpus files must be read as bytes and decoded explicitly "
            "(polar.corpus.sources.read_corpus_text):\n" + "\n".join(offenders)
        )


class TestAvisSurviveTheirAccents:
    def test_a_real_avis_reads_as_one_through_the_corpus_reader(self) -> None:
        assert parse_juricaf_decision_html(read_corpus_text(AVIS_FILE)).kind == "avis"

    def test_the_same_file_stops_being_an_avis_without_its_accents(self) -> None:
        # The regression itself, on the file it happened to: decoded by the
        # platform on a locale-less container, avis n° 003/2015 became an
        # ordinary judgment — and entered an authority line as one.
        flattened = AVIS_FILE.read_bytes().decode("ascii", errors="replace")
        assert parse_juricaf_decision_html(flattened).kind == "arret"
