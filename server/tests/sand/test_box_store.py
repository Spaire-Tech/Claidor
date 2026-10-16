"""Backups of the cloud computer, the upstream app's way
(`simeon/sand/box_store.py`, 14 October 2026).

The calls are the ones the box's host makes
(`packages/agent-store-sync/bcs-transport.ts`), in the JSON it sends, and
every assertion reads a field the host reads. The bytes go to a local S3
(`moto_server` on 127.0.0.1:9000, as the file tests use).
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import boto3
import httpx
import pytest
from pytest_mock import MockerFixture

from simeon.config import settings
from simeon.models import User
from simeon.postgres import AsyncSession
from simeon.sand import box_store
from simeon.sand.connect import ConnectError
from tests.desktop.test_endpoints import _signed_in

BC = "/simeon.v1.CloudAgentService"
LOCAL_S3 = "http://127.0.0.1:9000"


@pytest.fixture
def bucket(mocker: MockerFixture) -> Iterator[str]:
    """Backups on, against a fresh bucket in the local S3."""
    name = f"box-store-{uuid4().hex[:12]}"
    mocker.patch.object(settings, "BOX_STORE_BUCKET", name)
    mocker.patch.object(settings, "BOX_STORE_REGION", "us-east-1")
    mocker.patch.object(settings, "BOX_STORE_ENDPOINT_URL", LOCAL_S3)
    mocker.patch.object(settings, "BOX_STORE_ACCESS_KEY_ID", "test")
    mocker.patch.object(settings, "BOX_STORE_SECRET_ACCESS_KEY", "test")
    box_store.reset_client_for_tests()
    boto3.client(
        "s3",
        endpoint_url=LOCAL_S3,
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    ).create_bucket(Bucket=name)
    yield name
    box_store.reset_client_for_tests()


async def _headers(
    client: httpx.AsyncClient, session: AsyncSession, user: User
) -> dict[str, str]:
    access, _ = await _signed_in(client, session, user)
    return {"Authorization": f"Bearer {access}"}


async def _mint(
    client: httpx.AsyncClient, headers: dict[str, str], source: str
) -> dict[str, Any]:
    response = await client.post(
        f"{BC}/MintAgentStoreToken",
        json={"source": {"kind": 1, "sourceId": source}},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    return response.json()


def _signed_headers(url: str) -> set[str]:
    query = parse_qs(urlparse(url).query)
    return set(query["X-Amz-SignedHeaders"][0].split(";"))


class TestIds:
    def test_a_store_is_the_persons_own(self) -> None:
        source = box_store.box_source_id("u1")
        assert source == box_store.box_source_id("u1")
        assert source != box_store.box_source_id("u2")
        mine = box_store.store_id("u1", source)
        assert mine.startswith("store-")
        # Another account naming the same source gets another store.
        assert box_store.store_id("u2", source) != mine

    @pytest.mark.parametrize(
        "path",
        ["/etc/passwd", "a/../b", "..", "C:/x", "a/b\x01", "a/con.txt", "a/b.", ""],
    )
    def test_a_path_the_host_would_refuse_is_refused(self, path: str) -> None:
        with pytest.raises(ConnectError):
            box_store.normalize_rel_path(path)

    def test_a_good_path_is_kept(self) -> None:
        assert box_store.normalize_rel_path("./a//b/c.json") == "a/b/c.json"
        assert box_store.normalize_rel_path("blobs/ab/cd") == "blobs/ab/cd"


class TestToken:
    def test_the_token_opens_its_stores_for_its_person_only(self) -> None:
        token, expires = box_store.mint_token("u1", ["store-a"])
        assert expires > box_store.now_ms()
        assert box_store.read_token(token, "u1") == ["store-a"]
        with pytest.raises(ConnectError) as other:
            box_store.read_token(token, "u2")
        assert other.value.code == "unauthenticated"
        body, _, signature = token.partition(".")
        with pytest.raises(ConnectError):
            box_store.read_token(f"{body}.{signature[:-2]}xx", "u1")

    def test_an_expired_token_makes_the_host_mint_again(
        self, mocker: MockerFixture
    ) -> None:
        token, expires = box_store.mint_token("u1", ["store-a"])
        mocker.patch.object(box_store, "now_ms", return_value=expires + 1)
        with pytest.raises(ConnectError) as expired:
            box_store.read_token(token, "u1")
        assert expired.value.code == "unauthenticated"


class TestBoxEnv:
    def test_off_without_a_bucket(self, mocker: MockerFixture) -> None:
        mocker.patch.object(settings, "BOX_STORE_BUCKET", "")
        assert box_store.box_env("u1", restore="always") == {}

    def test_on_with_the_store_and_the_bucket_host(self, mocker: MockerFixture) -> None:
        mocker.patch.object(settings, "BOX_STORE_BUCKET", "simeon-backups")
        mocker.patch.object(settings, "BOX_STORE_REGION", "us-west-2")
        env = box_store.box_env("u1", restore=None)
        assert env == {
            "SAND_BOX_STORE_SYNC": "1",
            "SAND_BOX_STORE_ID": box_store.box_source_id("u1"),
            "SIMEON_AGENT_STORE_BUCKET_HOSTS": "simeon-backups.s3.us-west-2.amazonaws.com",
        }
        restoring = box_store.box_env("u1", restore="fresh")
        assert restoring["SIMEON_BOX_STORE_RESTORE"] == "fresh"
        assert len(restoring["SIMEON_BOX_STORE_RESTORE_ID"]) == 16
        # The copy helper is switched on by the host for its own run only.
        assert "SAND_BOX_STORE_COPY_IN" not in restoring
        # Once per container: a new id each time.
        again = box_store.box_env("u1", restore="always")
        assert again["SIMEON_BOX_STORE_RESTORE"] == "always"
        assert (
            again["SIMEON_BOX_STORE_RESTORE_ID"]
            != restoring["SIMEON_BOX_STORE_RESTORE_ID"]
        )


@pytest.mark.asyncio
class TestCalls:
    async def test_off_is_the_upstream_sentence(
        self, client: httpx.AsyncClient, session: AsyncSession, user: User
    ) -> None:
        headers = await _headers(client, session, user)
        response = await client.post(
            f"{BC}/MintAgentStoreToken",
            json={"source": {"sourceId": str(uuid4())}},
            headers=headers,
        )
        assert response.status_code == 403
        body = response.json()
        assert body["code"] == "permission_denied"
        assert "Agent store sync is not enabled" in body["message"]

    async def test_mint_names_the_persons_store(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        bucket: str,
    ) -> None:
        headers = await _headers(client, session, user)
        source = box_store.box_source_id(user.id)
        minted = await _mint(client, headers, source)
        assert minted["storeIds"] == [box_store.store_id(user.id, source)]
        assert minted["agentIds"] == []
        # int64 travels as a string in Connect JSON.
        assert isinstance(minted["expiresAtMs"], str)
        assert int(minted["expiresAtMs"]) > box_store.now_ms()
        bad = await client.post(
            f"{BC}/MintAgentStoreToken",
            json={"source": {"sourceId": "../../other"}},
            headers=headers,
        )
        assert bad.status_code == 400
        assert bad.json()["code"] == "invalid_argument"

    async def test_writes_and_reads_round_trip_through_s3(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        bucket: str,
    ) -> None:
        headers = await _headers(client, session, user)
        minted = await _mint(client, headers, box_store.box_source_id(user.id))
        store = minted["storeIds"][0]
        with_token = {**headers, "x-agent-store-token": minted["token"]}

        writes = await client.post(
            f"{BC}/PresignAgentStoreWrites",
            json={
                "storeId": store,
                "files": [
                    {"relPath": "blobs/aa/bb", "sha": "aabb", "size": "5"},
                    {
                        "relPath": "manifest.json",
                        "sha": "cafe",
                        "size": "2",
                        "expectAbsent": True,
                    },
                ],
            },
            headers=with_token,
        )
        assert writes.status_code == 200, writes.text
        blob, manifest = writes.json()["instructions"]
        assert blob["relPath"] == "blobs/aa/bb"
        assert "conflict" not in blob
        assert blob["headers"] == {"x-amz-meta-content-sha256": "aabb"}
        assert "x-amz-meta-content-sha256" in _signed_headers(blob["url"])
        # A precondition: the header S3 checks, signed, and a place for the
        # host's copy if it fails.
        assert manifest["headers"]["If-None-Match"] == "*"
        assert "if-none-match" in _signed_headers(manifest["url"])
        conflict = manifest["conflict"]
        assert conflict["relPath"].startswith("manifest.json.conflict-")
        assert conflict["headers"]["If-None-Match"] == "*"
        assert isinstance(manifest["expiresAtMs"], str)

        async with httpx.AsyncClient() as s3:
            put = await s3.put(blob["url"], content=b"hello", headers=blob["headers"])
            assert put.status_code == 200, put.text
            put = await s3.put(
                manifest["url"], content=b"{}", headers=manifest["headers"]
            )
            assert put.status_code == 200, put.text
            # S3 holds the condition: the second "must not exist" fails, and
            # the host keeps its copy at the conflict URL.
            again = await s3.put(
                manifest["url"], content=b"{}", headers=manifest["headers"]
            )
            assert again.status_code == 412
            kept = await s3.put(
                conflict["url"], content=b"{}", headers=conflict["headers"]
            )
            assert kept.status_code == 200, kept.text

        reads = await client.post(
            f"{BC}/PresignAgentStoreReads",
            json={"storeId": store, "relPaths": ["blobs/aa/bb", "missing"]},
            headers=with_token,
        )
        assert reads.status_code == 200, reads.text
        found, missing = reads.json()["instructions"]
        assert found["relPath"] == "blobs/aa/bb"
        async with httpx.AsyncClient() as s3:
            got = await s3.get(found["url"])
            assert got.content == b"hello"
            # A missing object reads 404 (the host's Range probe needs it).
            absent = await s3.get(missing["url"], headers={"Range": "bytes=0-0"})
            assert absent.status_code == 404

        assert box_store.has_backup(user.id) is True
        assert box_store.has_backup(uuid4()) is False

    async def test_a_store_outside_the_token_is_refused(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        bucket: str,
    ) -> None:
        headers = await _headers(client, session, user)
        minted = await _mint(client, headers, box_store.box_source_id(user.id))
        with_token = {**headers, "x-agent-store-token": minted["token"]}
        other = box_store.store_id(uuid4(), box_store.box_source_id(user.id))
        refused = await client.post(
            f"{BC}/PresignAgentStoreReads",
            json={"storeId": other, "relPaths": ["manifest.json"]},
            headers=with_token,
        )
        assert refused.status_code == 403
        no_token = await client.post(
            f"{BC}/PresignAgentStoreReads",
            json={"storeId": minted["storeIds"][0], "relPaths": ["manifest.json"]},
            headers=headers,
        )
        assert no_token.status_code == 401
        assert no_token.json()["code"] == "unauthenticated"
        climbing = await client.post(
            f"{BC}/PresignAgentStoreReads",
            json={"storeId": minted["storeIds"][0], "relPaths": ["../x"]},
            headers=with_token,
        )
        assert climbing.status_code == 400

    async def test_a_reset_clears_the_box_store_and_delete_account_everything(
        self,
        client: httpx.AsyncClient,
        session: AsyncSession,
        user: User,
        bucket: str,
    ) -> None:
        s3 = box_store._client()
        box = box_store.store_id(user.id, box_store.box_source_id(user.id))
        agent = box_store.store_id(user.id, "bc-abc")
        for store in (box, agent):
            for rel in ("manifest.json", "blobs/aa/bb"):
                s3.put_object(
                    Bucket=bucket,
                    Key=box_store.object_key(user.id, store, rel),
                    Body=b"x",
                )
        stranger = box_store.object_key(uuid4(), box, "manifest.json")
        s3.put_object(Bucket=bucket, Key=stranger, Body=b"x")

        assert box_store.clear_box_store(user.id) == 2
        assert box_store.has_backup(user.id) is False
        assert box_store.delete_user(user.id) == 2
        left = s3.list_objects_v2(Bucket=bucket).get("Contents", [])
        assert [item["Key"] for item in left] == [stranger]
