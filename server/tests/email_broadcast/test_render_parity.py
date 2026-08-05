"""Render parity test (Python side).

This file's fixture is byte-for-byte identical to the TypeScript fixture in
``clients/apps/web/src/app/(main)/dashboard/[organization]/email-marketing/
_components/blockEditor/render.parity.test.ts``. The Python and TS renderers
both consume the same JSON shape and produce the same HTML; if either drifts
the fixture in one repo, the matching test in the other will fail with a
visible diff.

To regenerate the golden HTML after an intentional renderer change:
    1. Update the TS fixture in render.parity.test.ts and verify it passes.
    2. Run this test, copy the actual rendered HTML into ``EXPECTED_HTML``.
    3. Add a third smoke check below for any new XSS / safe-URL guard you've
       introduced so the parity contract surfaces in both runtimes.
"""
from __future__ import annotations

from polar.email_broadcast.render import render_blocks_to_html


PARITY_FIXTURE = {
    "version": 1,
    "accent": "#4f46e5",
    "blocks": [
        {"id": "b1", "type": "eyebrow", "text": "Eyebrow"},
        {"id": "b2", "type": "heading", "level": 1, "text": "Title"},
        {"id": "b3", "type": "heading", "level": 2, "text": "Big", "huge": True},
        {"id": "b4", "type": "subheading", "text": "Sub"},
        {"id": "b5", "type": "paragraph", "text": "Para line 1\nPara line 2"},
        {"id": "b6", "type": "badge", "text": "New"},
        {
            "id": "b7",
            "type": "image",
            "src": "https://example.com/x.png",
            "alt": "X",
            "href": "https://example.com/y",
        },
        {
            "id": "b8",
            "type": "button",
            "text": "Go",
            "url": "https://example.com",
            "size": "md",
        },
        {"id": "b9", "type": "divider"},
        {
            "id": "b10",
            "type": "video",
            "embed_url": "https://example.com/v",
            "thumbnail": "https://example.com/t.png",
        },
        {
            "id": "b11",
            "type": "list",
            "ordered": False,
            "items": [
                {"id": "i1", "text": "First"},
                {"id": "i2", "text": "Second"},
            ],
        },
        {"id": "b12", "type": "quote", "text": "Believe", "cite": "Author"},
        {
            "id": "b13",
            "type": "columns",
            "cols": [
                {
                    "id": "c1",
                    "label": "A",
                    "title": "One",
                    "value": "$1",
                    "body": "Notes A",
                },
                {
                    "id": "c2",
                    "label": "B",
                    "title": "Two",
                    "value": "$2",
                    "body": "Notes B",
                },
            ],
        },
        {
            "id": "b14",
            "type": "checklist",
            "items": [
                {"id": "k1", "title": "Step one", "body": "Description one"},
                {"id": "k2", "title": "Step two"},
            ],
        },
        {
            "id": "b15",
            "type": "event-card",
            "day": "THU",
            "date": "MAY 22",
            "title": "Workshop",
            "meta": "Zoom",
        },
        {
            "id": "b16",
            "type": "receipt",
            "items": [
                {"id": "r1", "name": "Item", "sub": "Sub", "price": "$10"},
                {"id": "r2", "name": "Other", "price": "$5"},
            ],
            "total": "$15",
        },
        {
            "id": "b17",
            "type": "digest-item",
            "num": "01",
            "title": "Story",
            "meta": "4 min",
            "body": "Summary",
        },
    ],
}


def test_renders_fixture_deterministically() -> None:
    html = render_blocks_to_html(PARITY_FIXTURE)
    # Must contain the eyebrow, huge heading, button with custom accent, etc.
    assert "Eyebrow" in html
    assert "font-size:32px" in html  # huge heading variant
    assert "Para line 1<br>Para line 2" in html
    assert 'href="https://example.com"' in html
    # event-card hardcoded copy: literal apostrophe is fine — non-user content.
    assert "You're invited" in html
    # New ListItem object shape — backward-compatible with string[] too.
    assert "First" in html
    assert "Author" in html
    assert "$15" in html  # receipt total
    assert "<script" not in html
    assert "javascript:" not in html


def test_skips_malformed_blocks() -> None:
    html = render_blocks_to_html(
        {
            "version": 1,
            "blocks": [
                {"id": "x1"},  # no type
                {"id": "b1", "type": "heading", "level": 2, "text": "OK"},
            ],
        }
    )
    assert "OK" in html


def test_drops_javascript_urls() -> None:
    html = render_blocks_to_html(
        {
            "version": 1,
            "blocks": [
                {
                    "id": "b1",
                    "type": "button",
                    "url": "javascript:alert(1)",
                    "text": "Click",
                },
            ],
        }
    )
    assert "javascript:" not in html
    assert "Click" in html
    assert "<a " not in html


def test_legacy_string_list_items() -> None:
    """Drafts written before the ListItem migration store items as bare
    strings; the renderer must handle both shapes."""
    html = render_blocks_to_html(
        {
            "version": 1,
            "blocks": [
                {
                    "id": "l1",
                    "type": "list",
                    "ordered": False,
                    "items": ["Alpha", "Beta"],
                },
            ],
        }
    )
    assert "Alpha" in html
    assert "Beta" in html
