"""The Windows app's releases (`simeon.desktop.releases`, beside the Mac's):
the download redirect, the latest-release JSON, electron-updater's feed and
the files it names, with the bucket's `win32-x64/latest.json` mocked. No
database."""

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop.releases import (
    WindowsRelease,
    download_mac,
    download_windows,
    download_windows_feed,
    download_windows_file,
    download_windows_latest,
    forget_cached_releases,
    is_windows_file,
)

BASE = "https://releases.test/releases"
# What windows/scripts/release.mjs writes (`releaseRecord`).
INDEX = {
    "version": "0.2.0",
    "build": "4210",
    "commit": "a" * 40,
    "platform": "win32-x64",
    "minimum_windows": "10",
    "pub_date": "2026-11-02T21:00:00.000Z",
    "signed": True,
    "exe": {"url": "https://wrong.example/x.exe", "sha256": "e" * 64, "size": 10},
    "blockmap": {
        "url": "https://wrong.example/x.blockmap",
        "sha256": "b" * 64,
        "size": 2,
    },
}
INSTALLER = f"{BASE}/win32-x64/0.2.0/Simeon-Setup-0.2.0.exe"


@pytest.fixture(autouse=True)
def _base_url(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "DESKTOP_RELEASES_BASE_URL", BASE)
    forget_cached_releases()


def test_the_installer_url_comes_from_the_base_and_the_version_not_the_index() -> None:
    release = WindowsRelease.from_index(INDEX, BASE)
    assert release is not None
    assert release.exe_url == INSTALLER
    assert release.exe_sha256 == "e" * 64
    assert release.pub_date == "2026-11-02T21:00:00.000Z"
    # A version that isn't one whole version never makes a path.
    for version in ("0.2", "0.2.0/../../x", "0.2.0 ", "x", "0.2.0-a/b"):
        assert WindowsRelease.from_index({**INDEX, "version": version}, BASE) is None
    assert WindowsRelease.from_index(["not", "an", "index"], BASE) is None


@pytest.mark.asyncio
async def test_download_redirects_to_the_latest_installer_and_the_json_names_it() -> (
    None
):
    with respx.mock(assert_all_called=True) as mock:
        route = mock.get(f"{BASE}/win32-x64/latest.json").mock(
            return_value=httpx.Response(200, json=INDEX)
        )
        response = await download_windows()
        assert response.status_code == 302
        assert response.headers["location"] == INSTALLER
        latest = await download_windows_latest()
        assert latest.status_code == 200
        assert latest.body == (
            b'{"version":"0.2.0","pub_date":"2026-11-02T21:00:00.000Z","exe":{"url":"'
            + INSTALLER.encode()
            + b'","sha256":"'
            + b"e" * 64
            + b'"}}'
        )
    # One read for both: the index is cached.
    assert route.call_count == 1


@pytest.mark.asyncio
async def test_without_an_index_each_platform_says_its_own_is_not_published() -> None:
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{BASE}/win32-x64/latest.json").mock(return_value=httpx.Response(404))
        mock.get(f"{BASE}/darwin-arm64/latest.json").mock(
            return_value=httpx.Response(404)
        )
        windows = await download_windows()
        assert windows.status_code == 404
        assert windows.body == b'{"error":"Simeon for Windows is not published yet."}'
        assert (await download_windows_latest()).status_code == 404
        mac = await download_mac()
        assert mac.body == b'{"error":"Simeon for Mac is not published yet."}'


@pytest.mark.asyncio
async def test_the_mac_and_windows_indexes_are_read_and_kept_apart() -> None:
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{BASE}/win32-x64/latest.json").mock(
            return_value=httpx.Response(200, json=INDEX)
        )
        mock.get(f"{BASE}/darwin-arm64/latest.json").mock(
            return_value=httpx.Response(
                200, json={**INDEX, "version": "0.2.11", "platform": "darwin-arm64"}
            )
        )
        assert (await download_windows()).headers["location"] == INSTALLER
        assert (await download_mac()).headers["location"] == (
            f"{BASE}/darwin-arm64/0.2.11/Simeon-0.2.11-darwin-arm64.dmg"
        )


@pytest.mark.asyncio
async def test_an_unreadable_index_is_nothing_published() -> None:
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{BASE}/win32-x64/latest.json").mock(
            return_value=httpx.Response(200, text="not json")
        )
        assert (await download_windows()).status_code == 404


@pytest.mark.asyncio
async def test_the_updater_is_sent_to_its_feed_beside_the_folders() -> None:
    response = await download_windows_feed()
    assert response.status_code == 302
    assert response.headers["location"] == f"{BASE}/win32-x64/latest.yml"


@pytest.mark.asyncio
async def test_the_files_the_feed_names_are_sent_on_and_nothing_else() -> None:
    installer = await download_windows_file("0.2.0", "Simeon-Setup-0.2.0.exe")
    assert installer.status_code == 302
    assert installer.headers["location"] == INSTALLER
    blockmap = await download_windows_file("0.1.0", "Simeon-Setup-0.1.0.exe.blockmap")
    assert blockmap.headers["location"] == (
        f"{BASE}/win32-x64/0.1.0/Simeon-Setup-0.1.0.exe.blockmap"
    )
    for version, file in [
        ("0.2.0", "Simeon-Setup-0.1.0.exe"),
        ("0.2.0", "release.json"),
        ("0.2.0", "latest.yml"),
        ("..", "Simeon-Setup-...exe"),
        ("0.2.0", "Simeon-Setup-0.2.0.exe/../../darwin-arm64/latest.json"),
        ("latest.json", "x"),
    ]:
        response = await download_windows_file(version, file)
        assert response.status_code == 404, (version, file)
        assert "location" not in response.headers


def test_what_the_feed_may_name() -> None:
    assert is_windows_file("0.2.0", "Simeon-Setup-0.2.0.exe")
    assert is_windows_file("0.2.0-beta.1", "Simeon-Setup-0.2.0-beta.1.exe.blockmap")
    assert not is_windows_file("0.2.0", "Simeon-Setup-0.2.0.exe.sig")
    assert not is_windows_file("0.2.0-a..b", "Simeon-Setup-0.2.0-a..b.exe")


@pytest.mark.asyncio
async def test_the_routes_are_where_the_app_and_the_website_ask(
    client: httpx.AsyncClient,
) -> None:
    """The paths as mounted (`/desktop/...`): what electron-builder.yml's feed
    and the website's button name."""
    feed = await client.get("/desktop/download/windows/latest.yml?noCache=1abc")
    assert feed.status_code == 302
    assert feed.headers["location"] == f"{BASE}/win32-x64/latest.yml"
    installer = await client.get(
        "/desktop/download/windows/0.2.0/Simeon-Setup-0.2.0.exe"
    )
    assert installer.status_code == 302
    assert installer.headers["location"] == INSTALLER
    refused = await client.get("/desktop/download/windows/0.2.0/release.json")
    assert refused.status_code == 404
