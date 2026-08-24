"""Build the Swens workspace from the founder's export.

The founder designs in a canvas tool that exports one bundled HTML: a
`__bundler/template` script holding the whole page, and inside it a
`text/x-dc` script holding the component source. Hand-editing two
megabytes is not a method, so this file is the method: extract, apply
named edits, re-embed, and prove the result still renders.

**The rule this build enforces.** The design is the founder's. Edits
wire it, fill it, and add what is missing. Every edit that does not
keep its own anchor is recorded as a replacement and printed first,
before the log, so a deletion cannot hide in edit thirty-six. That
report exists because a previous build quietly replaced the
founder's chart with something of mine and buried it in the log.

    python docs/pierce/swens/build.py SOURCE.html OUT.html
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
TEMPLATE = re.compile(
    r'(<script type="__bundler/template">\s*)(".*?")(\s*</script>)', re.S
)


class EditFailed(Exception):
    """An edit could not find what it was written to change."""


class Build:
    """One pass over the design: load, edit, verify, write."""

    def __init__(self, source: Path):
        self.source = Path(source)
        self.raw = self.source.read_text(encoding="utf-8", errors="replace")
        found = TEMPLATE.search(self.raw)
        if found is None:
            raise EditFailed("no bundler template in this file")
        self.span = found.span(2)
        self.page = json.loads(found.group(2))
        self.log: list[str] = []
        self.gone: list[tuple[str, str]] = []

    #: --- primitives -------------------------------------------------

    def _took(self, old: str, new: str, why: str) -> None:
        """Record anything an edit removed rather than added around.

        An edit that keeps its anchor inside the replacement is
        additive — the design is still there, with something new
        beside it. An edit whose anchor does not survive has replaced
        the founder's markup, and that is the thing worth reporting
        loudly. Recorded here as it happens, which is exact; a diff
        of the whole page afterwards would be both slower and vaguer.
        """
        if old.strip() and old not in new:
            self.gone.append((why, " ".join(old.split())[:160]))

    def swap(self, old: str, new: str, *, times: int = 1, why: str = "") -> None:
        """Replace an exact string, insisting it was there to replace."""
        seen = self.page.count(old)
        if seen == 0:
            raise EditFailed(f"not found: {old[:80]!r}")
        if times and seen != times:
            raise EditFailed(f"expected {times} of {old[:60]!r}, found {seen}")
        self._took(old, new, why)
        self.page = self.page.replace(old, new)
        self.log.append(why or f"swapped {old[:40]!r}")

    def sub(self, pattern: str, new: str, *, why: str, flags: int = 0) -> None:
        """Regex replacement, insisting on at least one hit."""
        for hit in re.finditer(pattern, self.page, flags=flags):
            self._took(hit.group(0), re.sub(pattern, new, hit.group(0), flags=flags), why)
        self.page, n = re.subn(pattern, new, self.page, flags=flags)
        if n == 0:
            raise EditFailed(f"pattern matched nothing: {pattern[:80]}")
        self.log.append(f"{why} ({n})")

    def swap_after(self, anchor: str, old: str, new: str, *, why: str) -> None:
        """Replace the first `old` that follows `anchor`.

        Some markup is drawn identically in several places — the
        finding action cluster appears three times, once per surface
        that lists findings. Only the copy inside the block being
        wired should change, so the anchor names the block and the
        replacement stops at the first hit after it.
        """
        start = self.page.find(anchor)
        if start < 0:
            raise EditFailed(f"anchor not found: {anchor[:80]!r}")
        at = self.page.find(old, start)
        if at < 0:
            raise EditFailed(f"not found after anchor: {old[:80]!r}")
        self._took(old, new, why)
        self.page = self.page[:at] + new + self.page[at + len(old) :]
        self.log.append(why)

    def after(self, anchor: str, addition: str, *, why: str) -> None:
        """Insert straight after an anchor, adding without disturbing."""
        self.swap(anchor, anchor + addition, why=why)

    def has(self, text: str) -> bool:
        return text in self.page

    #: --- checks -----------------------------------------------------

    def removals(self) -> list[tuple[str, str]]:
        """Every piece of the founder's design an edit replaced."""
        return self.gone

    def depths(self, marks: dict[str, str], *, after: str) -> dict[str, int]:
        """How deep the tree is at each named anchor.

        A screen can render and still hang off the wrong parent: close
        one container too many and the block that follows paints
        happily outside the scroller, looking right until its content
        grows past the window and cannot be scrolled to. Nothing about
        the page's appearance catches that, so nesting is measured.
        """
        token = re.compile(r"<(/?)(div|sc-if|sc-for)\b[^>]*?(/?)>")
        start = self.page.index(after)
        depth, seen = 0, []
        for hit in token.finditer(self.page, start):
            closing, _tag, selfclosing = hit.groups()
            if selfclosing:
                continue
            depth += -1 if closing else 1
            seen.append((hit.start(), depth))

        def at(pos: int) -> int:
            level = 0
            for where, value in seen:
                if where >= pos:
                    break
                level = value
            return level

        return {name: at(self.page.index(anchor)) for name, anchor in marks.items()}

    #: --- output -----------------------------------------------------

    def write(self, out: Path) -> Path:
        out = Path(out)
        #: A literal </script> inside the JSON would close the tag the
        #: JSON lives in, truncating the page. The original encoder
        #: escapes the slash; so do we.
        encoded = json.dumps(self.page).replace("</", "<\\u002F")
        out.write_text(self.raw[: self.span[0]] + encoded + self.raw[self.span[1] :])
        return out


def main() -> None:
    source, out = Path(sys.argv[1]), Path(sys.argv[2])
    build = Build(source)
    from edits import ALL  # noqa: PLC0415 — edits import Build

    for edit in ALL:
        edit(build)

    #: Every project tab must sit at one depth, inside the scrolling
    #: column. Different numbers mean a tab escaped it.
    tabs = build.depths(
        {
            name: '<sc-if value="{{ pjTab%s }}"' % name
            for name in ("Overview", "Findings", "Sources")
        },
        after='<sc-if value="{{ pjChosen }}"',
    )
    if len(set(tabs.values())) != 1:
        raise EditFailed(f"project tabs sit at different depths: {tabs}")

    gone = build.removals()
    build.write(out)

    print("REPLACED IN THE FOUNDER'S DESIGN:")
    print("  " + ("\n  ".join(f"{why} <- {what}" for why, what in gone) if gone else "nothing"))
    print()
    print(f"tab nesting: all three at depth {next(iter(tabs.values()))}")
    print(f"{out} — {len(build.log)} edits, {len(build.page):,} chars")
    for line in build.log:
        print("  ·", line)


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    main()
