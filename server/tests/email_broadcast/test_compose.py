"""finalize_email_html / force_light_color_scheme — the send-time dark-mode lock.

Sent emails are one fixed design and must render identically whatever the
recipient's system dark/light mode. `content_html` is stored at SAVE time, so
documents saved by older editor versions carry a stale head (`color-scheme:
light dark`) that invites the mail client's own dark-mode recolouring. The
lock is enforced at send time so those keep working without a re-save.
"""

from polar.email.compose import (
    finalize_email_html,
    force_light_color_scheme,
    is_full_html_document,
)

# A stored document from an older editor version: declares BOTH schemes.
STALE_DOC = """<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  body{margin:0}
</style>
</head><body>
<a href="{{unsubscribe_url}}">Unsubscribe</a>
</body></html>"""

# A document with no color-scheme handling at all.
BARE_DOC = """<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>t</title></head>
<body><p style="color:#1f241c">Hello</p></body></html>"""

# What the current editor produces.
CURRENT_DOC = """<!DOCTYPE html>
<html><head>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<style>:root{color-scheme:only light}</style>
</head><body>ok</body></html>"""


def finalize(html: str) -> str:
    return finalize_email_html(
        html,
        unsubscribe_url="https://unsub.example",
        organization_name="Org",
    )


class TestForceLightColorScheme:
    def test_rewrites_stale_light_dark_head(self) -> None:
        out = force_light_color_scheme(STALE_DOC)
        assert 'content="light dark"' not in out
        assert out.count('content="light"') == 2
        assert "color-scheme:light dark" not in out
        assert "supported-color-schemes:light dark" not in out
        assert "color-scheme:only light" in out
        assert "supported-color-schemes:light" in out

    def test_injects_lock_when_document_has_none(self) -> None:
        out = force_light_color_scheme(BARE_DOC)
        assert '<meta name="color-scheme" content="light"/>' in out
        assert ":root,html,body{color-scheme:only light}" in out
        # Injected immediately inside <head>, before existing children.
        assert out.index('name="color-scheme"') < out.index("<title>")

    def test_idempotent_on_current_documents(self) -> None:
        once = force_light_color_scheme(CURRENT_DOC)
        twice = force_light_color_scheme(once)
        assert once == twice
        assert 'content="light"' in once
        assert "color-scheme:only light" in once
        # No duplicate lock injected — the metas were already present.
        assert once.count('name="color-scheme"') == 1

    def test_does_not_touch_unrelated_css(self) -> None:
        out = force_light_color_scheme(STALE_DOC)
        assert "body{margin:0}" in out


class TestFinalizeEmailHtml:
    def test_full_document_is_locked_and_unsubscribe_filled(self) -> None:
        out = finalize(STALE_DOC)
        assert is_full_html_document(out)
        assert "https://unsub.example" in out
        assert "{{unsubscribe_url}}" not in out
        assert 'content="light dark"' not in out
        assert "color-scheme:only light" in out

    def test_fragment_still_gets_wrapped(self) -> None:
        out = finalize("<h2>Hi</h2><p>fragment body</p>")
        # Wrapped in the marketing template → a full document around the
        # fragment, with the unsubscribe link included by the wrapper.
        assert is_full_html_document(out)
        assert "fragment body" in out
