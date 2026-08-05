import pytest
import respx
from httpx import Response

from polar.masterclass_architect.youtube import (
    API_BASE,
    ChannelNotFound,
    YouTubeNotConfigured,
    YouTubeReader,
    parse_channel_ref,
)


class TestParseChannelRef:
    def test_accepted_forms(self) -> None:
        cid = "UC" + "a" * 22
        assert parse_channel_ref("@somecreator") == ("handle", "@somecreator")
        assert parse_channel_ref("somecreator") == ("handle", "@somecreator")
        assert parse_channel_ref(cid) == ("id", cid)
        assert parse_channel_ref("https://www.youtube.com/@somecreator") == (
            "handle",
            "@somecreator",
        )
        assert parse_channel_ref(f"https://youtube.com/channel/{cid}") == ("id", cid)
        assert parse_channel_ref("https://youtube.com/user/legacyname") == (
            "username",
            "legacyname",
        )

    def test_rejected_forms(self) -> None:
        for bad in ["", "https://vimeo.com/@x", "https://youtube.com/watch?v=abc"]:
            with pytest.raises(ChannelNotFound):
                parse_channel_ref(bad)


class TestYouTubeReader:
    def test_missing_key_disables_feature(self) -> None:
        with pytest.raises(YouTubeNotConfigured):
            YouTubeReader(api_key="")

    @pytest.mark.asyncio
    @respx.mock
    async def test_resolve_channel(self) -> None:
        respx.get(f"{API_BASE}/channels").mock(
            return_value=Response(
                200,
                json={
                    "items": [
                        {
                            "id": "UC" + "b" * 22,
                            "snippet": {
                                "title": "Test Golf",
                                "customUrl": "@testgolf",
                                "description": "Caddie turned coach.",
                                "publishedAt": "2019-03-01T00:00:00Z",
                                "thumbnails": {"high": {"url": "http://a/x.jpg"}},
                            },
                            "statistics": {
                                "subscriberCount": "82000",
                                "videoCount": "120",
                            },
                            "contentDetails": {
                                "relatedPlaylists": {"uploads": "UUplaylist"}
                            },
                        }
                    ]
                },
            )
        )
        async with YouTubeReader(api_key="k") as reader:
            info = await reader.resolve_channel("@testgolf")
        assert info.title == "Test Golf"
        assert info.subscriber_count == 82000
        assert info.uploads_playlist_id == "UUplaylist"

    @pytest.mark.asyncio
    @respx.mock
    async def test_resolve_channel_not_found(self) -> None:
        respx.get(f"{API_BASE}/channels").mock(
            return_value=Response(200, json={"items": []})
        )
        async with YouTubeReader(api_key="k") as reader:
            with pytest.raises(ChannelNotFound):
                await reader.resolve_channel("@ghost")

    @pytest.mark.asyncio
    @respx.mock
    async def test_list_upload_ids_paginates(self) -> None:
        def page(request):  # type: ignore[no-untyped-def]
            token = request.url.params.get("pageToken", "")
            if not token:
                return Response(
                    200,
                    json={
                        "items": [
                            {"contentDetails": {"videoId": f"a{i}"}} for i in range(50)
                        ],
                        "nextPageToken": "p2",
                    },
                )
            return Response(
                200,
                json={
                    "items": [
                        {"contentDetails": {"videoId": f"b{i}"}} for i in range(10)
                    ]
                },
            )

        respx.get(f"{API_BASE}/playlistItems").mock(side_effect=page)
        async with YouTubeReader(api_key="k") as reader:
            ids = await reader.list_upload_ids("UUplaylist")
        assert len(ids) == 60
        assert ids[0] == "a0"
        assert ids[-1] == "b9"

    @pytest.mark.asyncio
    @respx.mock
    async def test_comments_disabled_is_not_an_error(self) -> None:
        respx.get(f"{API_BASE}/commentThreads").mock(
            return_value=Response(
                403,
                json={
                    "error": {
                        "errors": [{"reason": "commentsDisabled"}],
                        "message": "commentsDisabled",
                    }
                },
            )
        )
        async with YouTubeReader(api_key="k") as reader:
            result = await reader.fetch_comment_threads("vid1", "UCchan")
        assert result.comments_disabled is True
        assert result.comments == []

    @pytest.mark.asyncio
    @respx.mock
    async def test_owner_replies_extracted(self) -> None:
        respx.get(f"{API_BASE}/commentThreads").mock(
            return_value=Response(
                200,
                json={
                    "items": [
                        {
                            "snippet": {
                                "topLevelComment": {
                                    "snippet": {
                                        "textDisplay": "full course please",
                                        "likeCount": 42,
                                    }
                                }
                            },
                            "replies": {
                                "comments": [
                                    {
                                        "snippet": {
                                            "textDisplay": "Maybe one day!",
                                            "authorChannelId": {"value": "UCchan"},
                                        }
                                    },
                                    {
                                        "snippet": {
                                            "textDisplay": "yes please",
                                            "authorChannelId": {"value": "UCother"},
                                        }
                                    },
                                ]
                            },
                        }
                    ]
                },
            )
        )
        async with YouTubeReader(api_key="k") as reader:
            result = await reader.fetch_comment_threads("vid1", "UCchan")
        assert result.comments == [("full course please", 42)]
        assert result.owner_replies == ["Maybe one day!"]
