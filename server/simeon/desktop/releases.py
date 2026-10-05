"""The Mac app's releases: the download link on simeonlabs.com and the
answer an installed app gets when it asks for a newer version.

A release is made on a Mac (`desktop/scripts/release-macos.mjs`) and its
folder uploaded to the public bucket under
`releases/darwin-arm64/<version>/`, with its `release.json` copied once
more to `releases/darwin-arm64/latest.json`. That index is the one thing
the server reads (fetched over HTTPS, cached a few minutes); the file URLs
are built here from the bucket's public address and the version, so the
URLs inside the index do not matter.

Two routes:

- `GET /desktop/download/mac` sends the browser to the latest `.dmg`
  (302). The website's Download button points here, so the link never
  changes between releases.
- `GET /desktop/api/update/{platform}/{app}/{version}/{machine}/{channel}`
  is what the app's updater asks, in Squirrel.Mac's shape
  (`desktop/source/electron-main/update/update-feed.ts`,
  `buildUpdateRequestUrl`): 204 when the installed version is the latest
  or newer, else `{"url": <zip>, "name": <version>, "pub_date": ...}`.
  The app carries `SAND_UPDATE_FEED_BASE_URL=https://api.simeonlabs.com/desktop`
  in its bundle, so it asks here.

Until an index is uploaded, both answer "nothing": the download is a 404
with a sentence, the update a 204.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any

import httpx
import structlog
from fastapi import Response
from fastapi.responses import JSONResponse, RedirectResponse

from simeon.config import settings
from simeon.integrations.aws.s3 import S3Service
from simeon.routing import APIRouter

log = structlog.get_logger()

# Mounted under the desktop router (`/desktop`), like the other features.
router = APIRouter(include_in_schema=False)

PLATFORM = "darwin-arm64"
INDEX_TTL_S = 300.0
_VERSION = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?")


def parse_version(value: str) -> tuple[int, int, int, int] | None:
    """`0.1.0` → (0, 1, 0, 1); `0.1.0-beta.2` → (0, 1, 0, 0), a
    prerelease sorts before the release of the same number."""
    match = _VERSION.match(value.strip())
    if match is None:
        return None
    major, minor, patch, pre = match.groups()
    return (int(major), int(minor), int(patch), 0 if pre else 1)


def is_newer(candidate: str, installed: str) -> bool:
    left, right = parse_version(candidate), parse_version(installed)
    if left is None or right is None:
        return False
    return left > right


def releases_base_url() -> str:
    """Where the release folders live: the setting, or the public bucket."""
    configured = (settings.DESKTOP_RELEASES_BASE_URL or "").strip().rstrip("/")
    if configured:
        return configured
    return (
        S3Service(bucket=settings.S3_FILES_PUBLIC_BUCKET_NAME)
        .get_public_url("releases")
        .rstrip("/")
    )


def file_names(version: str, platform: str = PLATFORM) -> dict[str, str]:
    return {
        "dmg": f"Simeon-{version}-{platform}.dmg",
        "zip": f"Simeon-{version}-{platform}.zip",
    }


@dataclass(frozen=True)
class Release:
    version: str
    pub_date: str
    dmg_url: str
    zip_url: str
    dmg_sha256: str | None
    zip_sha256: str | None

    @classmethod
    def from_index(cls, index: dict[str, Any], base_url: str) -> Release | None:
        version = index.get("version")
        if not isinstance(version, str) or parse_version(version) is None:
            return None
        platform = index.get("platform") or PLATFORM
        names = file_names(version, platform)
        folder = f"{base_url}/{platform}/{version}"
        pub_date = index.get("pub_date")
        return cls(
            version=version,
            pub_date=pub_date if isinstance(pub_date, str) else "",
            dmg_url=f"{folder}/{names['dmg']}",
            zip_url=f"{folder}/{names['zip']}",
            dmg_sha256=_sha256_of(index.get("dmg")),
            zip_sha256=_sha256_of(index.get("zip")),
        )


def _sha256_of(section: Any) -> str | None:
    if not isinstance(section, dict):
        return None
    value = section.get("sha256")
    return value if isinstance(value, str) else None


_cache: dict[str, tuple[float, Release | None]] = {}


def forget_cached_releases() -> None:
    _cache.clear()


async def latest_release(platform: str = PLATFORM) -> Release | None:
    """The latest release for the platform, from `latest.json` in the
    bucket; None when there is none yet or it cannot be read. Cached for
    `INDEX_TTL_S` so a thousand installed apps asking in the same hour
    read the bucket a dozen times, not a thousand."""
    now = time.monotonic()
    cached = _cache.get(platform)
    if cached is not None and now - cached[0] < INDEX_TTL_S:
        return cached[1]
    base = releases_base_url()
    url = f"{base}/{platform}/latest.json"
    release: Release | None = None
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers={"cache-control": "no-cache"})
        if response.status_code == 200:
            release = Release.from_index(response.json(), base)
            if release is None:
                log.warning("desktop.releases.index_unreadable", url=url)
        elif response.status_code not in (403, 404):
            log.warning(
                "desktop.releases.index_status", url=url, status=response.status_code
            )
    except (httpx.HTTPError, ValueError) as error:
        log.warning("desktop.releases.index_failed", url=url, error=str(error))
    _cache[platform] = (now, release)
    return release


@router.get("/download/mac", name="desktop:download_mac")
async def download_mac() -> Response:
    release = await latest_release()
    if release is None:
        return JSONResponse(
            {"error": "Simeon for Mac is not published yet."}, status_code=404
        )
    return RedirectResponse(release.dmg_url, status_code=302)


@router.get("/download/mac/latest", name="desktop:download_mac_latest")
async def download_mac_latest() -> Response:
    """The latest release as JSON, for the website or a person checking."""
    release = await latest_release()
    if release is None:
        return JSONResponse({"version": None}, status_code=404)
    return JSONResponse(
        {
            "version": release.version,
            "pub_date": release.pub_date,
            "dmg": {"url": release.dmg_url, "sha256": release.dmg_sha256},
            "zip": {"url": release.zip_url, "sha256": release.zip_sha256},
        }
    )


@router.get(
    "/api/update/{platform}/{app}/{version}/{machine}/{channel}",
    name="desktop:update_feed",
)
async def update_feed(
    platform: str, app: str, version: str, machine: str, channel: str
) -> Response:
    """Squirrel.Mac's question. `app` is `sand`, `sand-nightly` or
    `sand-dogfood` (the app's track names); only the stable track has
    releases, the others answer 204."""
    if platform != PLATFORM or app != "sand":
        return Response(status_code=204)
    release = await latest_release(platform)
    if release is None or not is_newer(release.version, version):
        return Response(status_code=204)
    return JSONResponse(
        {"url": release.zip_url, "name": release.version, "pub_date": release.pub_date},
        headers={"cache-control": "no-store"},
    )
