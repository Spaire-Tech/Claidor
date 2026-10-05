"""The Mac app's releases (`simeon.desktop.releases`): the download
redirect, the latest-release JSON and the updater's Squirrel answer, with
the bucket's `latest.json` mocked. No database."""

import httpx
import pytest
import respx
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.desktop import releases
from simeon.desktop.releases import (
    Release,
    download_mac,
    download_mac_latest,
    forget_cached_releases,
    is_newer,
    parse_version,
    update_feed,
)

BASE = "https://releases.test/releases"
INDEX = {
    "version": "0.1.0",
    "platform": "darwin-arm64",
    "pub_date": "2026-10-05T20:00:00.000Z",
    "dmg": {"url": "https://wrong.example/x.dmg", "sha256": "d" * 64, "size": 10},
    "zip": {"url": "https://wrong.example/x.zip", "sha256": "z" * 64, "size": 11},
}


def test_versions_compare_as_numbers_and_a_prerelease_sorts_before_its_release() -> (
    None
):
    assert parse_version("0.1.0") == (0, 1, 0, 1)
    assert parse_version("0.1.0-beta.2") == (0, 1, 0, 0)
    assert parse_version("nope") is None
    assert is_newer("0.2.0", "0.1.9")
    assert is_newer("0.1.10", "0.1.9")
    assert is_newer("0.1.0", "0.1.0-beta.2")
    assert not is_newer("0.1.0", "0.1.0")
    assert not is_newer("0.1.0", "0.2.0")
    assert not is_newer("0.1.0", "garbage")


def test_the_file_urls_come_from_the_base_and_the_version_not_the_index() -> None:
    release = Release.from_index(INDEX, BASE)
    assert release is not None
    assert release.dmg_url == f"{BASE}/darwin-arm64/0.1.0/Simeon-0.1.0-darwin-arm64.dmg"
    assert release.zip_url == f"{BASE}/darwin-arm64/0.1.0/Simeon-0.1.0-darwin-arm64.zip"
    assert release.dmg_sha256 == "d" * 64
    assert Release.from_index({"version": "x"}, BASE) is None


@pytest.fixture(autouse=True)
def _base_url(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "DESKTOP_RELEASES_BASE_URL", BASE)
    forget_cached_releases()


@pytest.mark.asyncio
async def test_download_redirects_to_the_latest_dmg_and_the_json_names_it() -> None:
    with respx.mock(assert_all_called=True) as mock:
        route = mock.get(f"{BASE}/darwin-arm64/latest.json").mock(
            return_value=httpx.Response(200, json=INDEX)
        )
        response = await download_mac()
        assert response.status_code == 302
        assert (
            response.headers["location"]
            == f"{BASE}/darwin-arm64/0.1.0/Simeon-0.1.0-darwin-arm64.dmg"
        )
        latest = await download_mac_latest()
        assert latest.status_code == 200
        assert b'"version":"0.1.0"' in latest.body
    # One read for both: the index is cached.
    assert route.call_count == 1


@pytest.mark.asyncio
async def test_without_an_index_the_download_is_404_and_the_update_204() -> None:
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{BASE}/darwin-arm64/latest.json").mock(
            return_value=httpx.Response(404)
        )
        assert (await download_mac()).status_code == 404
        assert (
            await update_feed("darwin-arm64", "sand", "0.0.1", "machine", "stable")
        ).status_code == 204


@pytest.mark.asyncio
async def test_the_updater_hears_about_a_newer_version_only() -> None:
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{BASE}/darwin-arm64/latest.json").mock(
            return_value=httpx.Response(200, json=INDEX)
        )
        older = await update_feed("darwin-arm64", "sand", "0.0.9", "machine", "stable")
        assert older.status_code == 200
        assert older.body == (
            b'{"url":"'
            + f"{BASE}/darwin-arm64/0.1.0/Simeon-0.1.0-darwin-arm64.zip".encode()
            + b'","name":"0.1.0","pub_date":"2026-10-05T20:00:00.000Z"}'
        )
        same = await update_feed("darwin-arm64", "sand", "0.1.0", "machine", "stable")
        assert same.status_code == 204
        # The other tracks and platforms have no releases.
        assert (
            await update_feed("darwin-arm64", "sand-nightly", "0.0.1", "m", "stable")
        ).status_code == 204
        assert (
            await update_feed("win32-x64-user", "sand", "0.0.1", "m", "stable")
        ).status_code == 204


def test_the_base_url_falls_back_to_the_public_bucket(mocker: MockerFixture) -> None:
    mocker.patch.object(settings, "DESKTOP_RELEASES_BASE_URL", None)
    public = mocker.patch.object(
        releases.S3Service,
        "get_public_url",
        return_value="https://bucket.example/releases",
    )
    assert releases.releases_base_url() == "https://bucket.example/releases"
    public.assert_called_once_with("releases")
