"""Build the Ambre workspace from the founder's exported design.

The founder designs in a canvas tool that exports one bundled HTML:
a `__bundler/template` script holding the whole page, inside which a
`text/x-dc` script holds the component source (data + props) and the
body holds the markup. Hand-editing two megabytes is not a method,
so this file is the method: extract, apply named edits, re-embed,
and let `shots.mjs` prove the result still renders.

Every edit is a named function with a docstring saying why it
exists. An edit that does not find its target raises — a silent
no-op would leave the design saying something we think we changed.

    python docs/pierce/workspace/build.py SOURCE.html OUT.html
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

    #: --- primitives -------------------------------------------------

    def swap(self, old: str, new: str, *, times: int = 1, why: str = "") -> None:
        """Replace an exact string, insisting it was there to replace."""
        seen = self.page.count(old)
        if seen == 0:
            raise EditFailed(f"not found: {old[:70]!r}")
        if times and seen != times:
            raise EditFailed(f"expected {times} of {old[:50]!r}, found {seen}")
        self.page = self.page.replace(old, new)
        self.log.append(why or f"swapped {old[:40]!r}")

    def sub(self, pattern: str, new: str, *, why: str, flags: int = 0) -> None:
        """Regex replacement, insisting on at least one hit."""
        self.page, n = re.subn(pattern, new, self.page, flags=flags)
        if n == 0:
            raise EditFailed(f"pattern matched nothing: {pattern[:70]}")
        self.log.append(f"{why} ({n})")

    def has(self, text: str) -> bool:
        return text in self.page

    #: --- checks -----------------------------------------------------

    def depths(self, marks: dict[str, str], *, after: str) -> dict[str, int]:
        """How deep the tree is at each named anchor.

        A screen can render and still be in the wrong place: close one
        container too many and the block that follows paints happily
        outside the scroller, looking correct until its content grows
        past the window and cannot be scrolled to. Nothing about the
        page's appearance catches that, so the nesting is measured.
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
        #: A literal </script> inside the JSON would close the tag
        #: the JSON lives in, truncating the page. The original
        #: encoder escapes the slash; so do we.
        encoded = json.dumps(self.page).replace("</", "<\\u002F")
        rebuilt = self.raw[: self.span[0]] + encoded + self.raw[self.span[1] :]
        out.write_text(rebuilt, encoding="utf-8")
        return out


def data() -> dict:
    """The real audit this design shows — no invented numbers."""
    return json.loads((HERE / "real-audit.json").read_text())


def main() -> None:
    source, out = Path(sys.argv[1]), Path(sys.argv[2])
    build = Build(source)
    from edits import ALL  # noqa: PLC0415 — edits import Build

    for edit in ALL:
        edit(build, data())

    #: Every project tab must sit at the same depth, inside the
    #: scrolling column. Different numbers here mean a tab escaped it.
    tabs = build.depths(
        {
            name: f'<sc-if value="{{{{ pjTab{name} }}}}"'
            for name in ("Overview", "Findings", "Versions", "Sources")
        },
        after='<sc-if value="{{ pjChosen }}"',
    )
    if len(set(tabs.values())) != 1:
        raise EditFailed(f"project tabs sit at different depths: {tabs}")
    print(f"tab nesting: all four at depth {next(iter(tabs.values()))}")

    build.write(out)
    print(f"{out} — {len(build.log)} edits")
    for line in build.log:
        print("  ·", line)


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    main()
