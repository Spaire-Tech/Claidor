#!/usr/bin/env python3
"""The connectors' app icons, for the iPhone's Connectors (14 October 2026).

The founder: "full logo. And i want all logo. some are missing." Each
connector shows its own app icon, the logo filling the tile, as the App
Store and the founder's reference (ChatGPT's Plugins) show them.

    python3 ios/scripts/app_icons.py          # build (no network)
    python3 ios/scripts/app_icons.py fetch    # fetch again, then build

`fetch` takes each connector's icon from its iOS app on the App Store (the
iTunes lookup API, by bundle id, 512 px) and, for the connectors with no iOS
app of their own, draws one from its mark in desktop/brand/connector-logos on
the mark's own ground (Chromium, through Python's Playwright). It writes
desktop/brand/app-icons/<id>.png (192 px) and sources.json, which says where
each came from.

`build` reads the catalogue (desktop/source/shared/node/vendor-mcp/catalog.ts)
and writes:
- ios/Simeon/AppIcons.xcassets/AppIcons/<id>.imageset, one per connector, in a
  catalogue of its own that the Mac app builds too (21 October 2026);
- ios/SimeonCore/Sources/SimeonCore/GeneratedAppIcons.swift, every id with
  its name (ConnectorIcons.swift finds an icon by any of an app's names).
It fails when a connector in the catalogue has no icon: add the app to
STORE_APPS or MADE below and fetch again.
"""

from __future__ import annotations

import base64
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "desktop/source/shared/node/vendor-mcp/catalog.ts"
ICONS = ROOT / "desktop/brand/app-icons"
MARKS = ROOT / "desktop/brand/connector-logos"
ASSETS = ROOT / "ios/Simeon/AppIcons.xcassets/AppIcons"
SWIFT = ROOT / "ios/SimeonCore/Sources/SimeonCore/GeneratedAppIcons.swift"
SIDE = 192

#: The connector's iOS app on the App Store, by bundle id, checked by hand
#: on 14 October 2026 (the right maker, the app people know). TikTok Ads has
#: no app of its own; TikTok's is the one people know. Facebook Pages is
#: Facebook's.
STORE_APPS = {
    "gmail": "com.google.Gmail", "outlook": "com.microsoft.Office.Outlook",
    "google-calendar": "com.google.calendar", "notion": "notion.id",
    "google-drive": "com.google.Drive", "dropbox": "com.getdropbox.Dropbox",
    "airtable": "com.FormaGrid.Hyperbase", "asana": "com.asana.Asana",
    "clickup": "com.clickup.mobile", "monday": "com.monday.monday",
    "todoist": "com.todoist.ios", "zoom": "us.zoom.videomeetings",
    "google-meet": "com.google.Tachyon", "figma": "com.figma.FigmaMirror",
    "canva": "com.canva.canvaeditor", "miro": "com.realtimeboard.rtbPhone",
    "wix": "com.wix.admin", "stripe": "com.stripe.dashboard",
    "paypal": "com.yourcompany.PPClient", "square": "com.squareup.square",
    "ramp": "com.ramp.Ramp.ios", "quickbooks": "com.intuit.QBOiPad",
    "hubspot": "com.hubspot.CRMAppRelease", "salesforce": "com.salesforce.chatter",
    "intercom": "io.intercom.ios", "linear": "com.linear.ios",
    "jira": "com.atlassian.jira.app", "github": "com.github.stormbreaker.prod",
    "mailchimp": "com.theRocketScienceGroup.mailChimp", "greenhouse": "io.greenhouse.Greenhouse",
    "gusto": "com.gusto.money", "slack": "com.tinyspeck.chatlyio",
    "linkedin": "com.linkedin.LinkedIn", "google-docs": "com.google.Docs",
    "google-sheets": "com.google.Sheets", "google-slides": "com.google.Slides",
    "onedrive": "com.microsoft.skydrive", "google-tasks": "com.google.tasks",
    "trello": "com.fogcreek.trello", "xero": "JEC2FK53N4.com.xero.XeroTouch",
    "shopify": "com.jadedpixel.shopify", "brex": "com.brex.mobile.ios",
    "pipedrive": "com.pipedrive.Pipedrive", "docusign": "com.docusign.DocuSignIt",
    "google-analytics": "com.google.AnalyticsApp", "youtube": "com.google.ios.youtube",
    "instagram": "com.burbn.instagram", "facebook": "com.facebook.Facebook",
    "calendly": "com.calendly.Calendly", "cal-com": "com.cal.companion",
    "attio": "com.attio", "zendesk": "com.zendesk.agent.appstore",
    "microsoft-teams": "com.microsoft.skype.teams", "discord": "com.hammerandchisel.discord",
    "mercury": "com.mercury.iOSApp", "google-ads": "com.google.AdWords",
    "tiktok-ads": "com.zhiliaoapp.musically", "microsoft-excel": "com.microsoft.Office.Excel",
    "reddit": "com.reddit.Reddit", "pinterest": "pinterest",
    "gumroad": "com.GRD.Gumroad", "google-classroom": "com.google.Classroom",
    "gorgias": "com.gorgias.main",
    "gong": "io.gong.mobileapp",
    "capsule-crm": "com.zestia.capsule", "dialpad": "co.switch.Switch",
    "link": "com.stripe.link", "granola": "com.granola.ios-prod",
    "sharepoint": "com.microsoft.sharepoint", "onenote": "com.microsoft.onenote",
    "microsoft-to-do": "com.microsoft.to-do", "lovable": "dev.lovable.build",
    "shop": "com.jadedlabs.arrive",
    # 17 October 2026, checked by hand the same way. WhatsApp's connector is
    # WhatsApp Business, so its app is; Reddit Ads and Pinterest Ads have no
    # app of their own (Reddit's and Pinterest's are the ones people know);
    # Dynamics 365's is Dynamics 365 Sales; Lucid's is Lucidchart; NotebookLM's
    # app is listed as "Gemini Notebook" by Google.
    "whatsapp": "net.whatsapp.WhatsAppSMB", "twitch": "tv.twitch",
    "reddit-ads": "com.reddit.Reddit", "pinterest-ads": "pinterest",
    "eventbrite": "com.eventbrite.attendee", "google-photos": "com.google.photos",
    "mural": "co.mural.iOS", "box": "net.box.BoxNet",
    "confluence": "com.atlassian.confluence.app", "notebooklm": "com.google.NotebookLM",
    "basecamp": "com.basecamp.bc3-ios", "wrike": "Wrike.WrikeApp",
    "ticktick": "com.TickTick.task", "harvest": "com.getharvest.Harvest",
    "google-maps": "com.google.Maps", "webex": "com.cisco.squared",
    "fathom": "video.fathom.ios",
    "freshbooks": "com.freshbooks.helios",
    "ynab": "com.youneedabudget.evergreen.YNAB-Evergreen", "splitwise": "com.Splitwise.SplitwiseMobile",
    "dynamics-365": "com.microsoft.dynamics.iphone.moca.sales",
    "pagerduty": "com.pagerduty.PagerDuty", "heygen": "com.heygen.mobile",
    "gamma": "app.gamma.mobile", "lucid": "com.lucidchart.app",
    "pandadoc": "com.pandadoc.mobile", "otter": "com.aisense.otter",
    "read-ai": "read.ai.meeting-notes", "fellow": "co.fellow.app",
    # 17 October 2026, later: the 52 on their makers' servers, checked the
    # same way (the App Store's own search, apps.apple.com, as the lookup API
    # refused this machine that day). Make's app is listed by Celonis, which
    # owns Make; Missive's by Heliom, its maker.
    "mailerlite": "com.mailerlite-inc.mailerlite-v2", "getresponse": "com.implix.GetResponse",
    "bitly": "com.bitly.Bitly", "semrush": "com.semrush.tracking",
    "runway": "com.runwayml.mobiletest", "make": "com.Integromat.skoumal",
    "jotform": "com.jotform.v2", "surveymonkey": "com.surveymonkey.SurveyMonkey",
    "fireflies": "ai.fireflies.mobile", "tldv": "com.tldv.tldvlite",
    "avoma": "com.avoma.Avoma", "missive": "com.missiveapp.mail",
    "close": "com.close.mobile", "aircall": "com.aircall.Aircall",
    "workable": "com.workable.ats", "breezy-hr": "com.breezyhr.Breezy",
    "railway": "com.railway.app", "datadog": "com.datadog.flagship",
    "razorpay": "com.razorpay.payments.app", "coinbase": "com.vilcsak.bitcoin2",
}

#: No iOS app of their own: the mark from connector-logos on its ground.
#: "cover" when the mark is already a whole tile, else the mark's share.
MADE = {
    "vercel": ("#000000", "cover"), "supabase": ("#1c1c1c", "cover"),
    "sentry": ("#712fa5", "cover"), "posthog": ("#000000", "cover"),
    "resend": ("#ffffff", "cover"), "ashby": ("#473bce", "cover"),
    "webflow": ("#146ef5", "cover"), "cloudflare": ("#ffffff", 0.74),
    "apollo": ("#ebf212", "cover"), "klaviyo": ("#ffffff", "cover"),
    "kit": ("#44b1ff", "cover"), "google-search-console": ("#ffffff", 0.70),
    # 17 October 2026: no iOS app of their own (the App Store's matches were
    # other makers' apps or clients for them).
    "omnisend": ("#ffffff", "cover"), "dub": ("#000000", "cover"),
    "zeplin": ("#ffffff", "cover"), "contentful": ("#ffffff", 0.70),
    "typeform": ("#faf9fb", "cover"), "productboard": ("#ffffff", 0.70),
    "shippo": ("#ffffff", 0.80), "gitlab": ("#ffffff", 0.74),
    "bitbucket": ("#ffffff", 0.70), "google-bigquery": ("#ffffff", 0.70),
    "hugging-face": ("#ffffff", 0.78), "excalidraw": ("#ffffff", 0.74),
    "higgsfield": ("#d1fe17", "cover"), "descript": ("#651a39", "cover"),
    "eraser": ("#ffffff", 0.74), "mobbin": ("#ffffff", "cover"),
    "magic-patterns": ("#ffffff", 0.74), "plaid": ("#ffffff", 0.78),
    "clay": ("#ffffff", 0.78), "netlify": ("#ffffff", "cover"),
    "neon": ("#000000", "cover"),
    # 17 October 2026, later: the 32 of the 52 with no iOS app of their own
    # (Coda's is now Superhuman Docs, ElevenLabs' are ElevenReader and
    # ElevenMusic: their marks are the ones people know from the connector).
    "beehiiv": ("#ffffff", 0.80), "customer-io": ("#0b353b", "cover"),
    "lemlist": ("#316bff", "cover"), "mixpanel": ("#1b0b3b", "cover"),
    "amplitude": ("#ffffff", 0.80), "ahrefs": ("#3a57fc", "cover"),
    "moz": ("#4dbdeb", "cover"), "dataforseo": ("#ffffff", 0.78),
    "brevo": ("#0b996e", "cover"), "black-forest-labs": ("#ffffff", "cover"),
    "fal": ("#ffc4d8", "cover"), "replicate": ("#e21c20", "cover"),
    "creatomate": ("#ffffff", 0.78), "shotstack": ("#ffffff", 0.78),
    "bannerbear": ("#64daee", "cover"), "cloudinary": ("#3448c5", "cover"),
    "sanity": ("#0d0e12", "cover"), "wistia": ("#ffffff", 0.78),
    "captions": ("#1d1f20", "cover"), "elevenlabs": ("#ffffff", "cover"),
    "storyblok": ("#1f1f1f", "cover"), "coda": ("#ffffff", 0.80),
    "tally": ("#ffffff", "cover"), "canny": ("#525df9", "cover"),
    "mixmax": ("#ffffff", "cover"), "hunter": ("#ffffff", "cover"),
    "lusha": ("#ffffff", 0.78), "postman": ("#ffffff", 0.80),
    "tavily": ("#1f1e1e", "cover"), "exa": ("#1f40ed", "cover"),
    "shortcut": ("#494bcb", "cover"), "typefully": ("#34b4f6", "cover"),
}


def catalog() -> list[tuple[str, str]]:
    """Every connector's id and name, in the catalogue's order."""
    source = CATALOG.read_text()
    pairs = re.findall(r'id: "([a-z0-9-]+)", name: "([^"]+)"', source)
    if len(pairs) != len(re.findall(r'\bid: "', source)):
        sys.exit("catalog.ts: a connector's id and name are not side by side")
    return pairs


def _get(url: str) -> bytes:
    for attempt in range(4):
        try:
            return urllib.request.urlopen(url, timeout=30).read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3)
    raise AssertionError


def fetch() -> None:
    from io import BytesIO

    from PIL import Image
    from playwright.sync_api import sync_playwright

    ICONS.mkdir(parents=True, exist_ok=True)
    sources: dict[str, dict[str, str]] = {}

    def save(cid: str, png: bytes) -> None:
        image = Image.open(BytesIO(png)).convert("RGB").resize((SIDE, SIDE), Image.LANCZOS)
        image.save(ICONS / f"{cid}.png", optimize=True)

    for cid, bundle in STORE_APPS.items():
        query = urllib.parse.urlencode({"bundleId": bundle, "country": "us"})
        found = json.loads(_get(f"https://itunes.apple.com/lookup?{query}"))["results"]
        if not found:
            sys.exit(f"{cid}: no App Store app {bundle}")
        app = found[0]
        artwork = app["artworkUrl512"].rsplit("/", 1)[0] + "/512x512bb.png"
        save(cid, _get(artwork))
        sources[cid] = {"from": "App Store", "bundleId": bundle, "app": app["trackName"], "seller": app.get("sellerName", "")}
        time.sleep(0.3)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
        page = browser.new_page(viewport={"width": 512, "height": 512})
        for cid, (ground, fit) in MADE.items():
            mark = MARKS / f"{cid}.svg"
            if not mark.exists():
                mark = MARKS / f"{cid}.png"
            mime = "image/svg+xml" if mark.suffix == ".svg" else "image/png"
            data = base64.b64encode(mark.read_bytes()).decode()
            share = "100%" if fit == "cover" else f"{float(fit) * 100:.0f}%"
            page.set_content(
                f"<body style='margin:0'><div style='width:512px;height:512px;background:{ground};display:flex;"
                f"align-items:center;justify-content:center;overflow:hidden'><img style='width:{share};height:{share};"
                f"object-fit:contain' src='data:{mime};base64,{data}'></div></body>"
            )
            page.wait_for_timeout(150)
            save(cid, page.screenshot(clip={"x": 0, "y": 0, "width": 512, "height": 512}))
            sources[cid] = {"from": f"connector-logos/{mark.name}", "ground": ground, "fit": str(fit)}
        browser.close()
    (ICONS / "sources.json").write_text(json.dumps(dict(sorted(sources.items())), indent=1) + "\n")


def build() -> None:
    connectors = catalog()
    missing = [cid for cid, _ in connectors if not (ICONS / f"{cid}.png").exists()]
    if missing:
        sys.exit(f"no app icon for {', '.join(missing)}: add it to STORE_APPS or MADE and run `fetch`")
    if ASSETS.exists():
        for old in sorted(ASSETS.rglob("*"), reverse=True):
            old.unlink() if old.is_file() else old.rmdir()
    ASSETS.mkdir(parents=True, exist_ok=True)
    meta = {"info": {"author": "xcode", "version": 1}}
    if not (ASSETS.parent / "Contents.json").exists():
        (ASSETS.parent / "Contents.json").write_text(json.dumps(meta, indent=2) + "\n")
    (ASSETS / "Contents.json").write_text(json.dumps({**meta, "properties": {"provides-namespace": True}}, indent=2) + "\n")
    for cid, _ in connectors:
        folder = ASSETS / f"{cid}.imageset"
        folder.mkdir()
        (folder / f"{cid}.png").write_bytes((ICONS / f"{cid}.png").read_bytes())
        contents = {
            "images": [{"filename": f"{cid}.png", "idiom": "universal"}],
            **meta,
            "properties": {"template-rendering-intent": "original"},
        }
        (folder / "Contents.json").write_text(json.dumps(contents, indent=2) + "\n")
    rows = "\n".join(f"    ({json.dumps(cid)}, {json.dumps(name)})," for cid, name in connectors)
    SWIFT.write_text(
        "// Generated by ios/scripts/app_icons.py from the connectors' catalogue\n"
        "// (desktop/source/shared/node/vendor-mcp/catalog.ts). Do not edit by hand.\n\n"
        "public enum GeneratedAppIcons {\n"
        "  /** Every connector with its app icon (`AppIcons/<id>`): the catalogue's id and name, in its order. */\n"
        "  public static let connectors: [(id: String, name: String)] = [\n"
        f"{rows}\n"
        "  ]\n"
        "}\n"
    )
    print(f"app icons {len(connectors)}")


if __name__ == "__main__":
    if sys.argv[1:] == ["fetch"]:
        fetch()
    elif sys.argv[1:]:
        sys.exit(__doc__)
    build()
