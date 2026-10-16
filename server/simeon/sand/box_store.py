"""Backups of each person's cloud computer, the upstream app's way
(14 October 2026).

The host in the box keeps its own backup (`box-store-sync` in
`desktop/source/host/extensions/box-store-sync/`): every two minutes it
copies the agents' data (`/home/box/sand-data`), the workspace, the app
sign-ins (`cli-config`) and Chrome's cookies, saved logins and site data
to an object store, file by file under their sha256, with one
`manifest.json` naming what goes where; a box made fresh copies them back
before its host starts (`host-main.cjs --box-copy-in`). The host speaks the
upstream's agent store for it, on `simeon.v1.CloudAgentService`
(`packages/agent-store-sync/bcs-transport.ts`): `MintAgentStoreToken` for
a short-lived token naming the store, then `PresignAgentStoreReads` and
`PresignAgentStoreWrites` for presigned S3 URLs, and it moves the bytes
itself. This module answers those three calls over our own bucket
(`BOX_STORE_BUCKET`) and says what each box is told (`box_env`).

What the host asks of the answers, read from its code:

- A write with a precondition gets the conditional header S3 checks
  (`If-None-Match: *` for "must not exist yet", `If-Match` for "still the
  version I read") and a `conflict` instruction: a second URL where the
  host keeps its copy when the condition fails, so nothing is lost
  (`agent-store-sand-files.ts`, `putAgentStoreObject`).
- Before overwriting `manifest.json` it reads it with a presigned GET and
  `Range: bytes=0-0` for its ETag; a missing object must read 404, which
  S3 only does when the key may list the bucket.
- It accepts presigned URLs only on its allowlisted hosts; the box is told
  ours (`SIMEON_AGENT_STORE_BUCKET_HOSTS`).

A store belongs to one person: its id is derived from the person and the
source the host names, so another account naming the same source gets
another store, and every key lives under the person's own prefix, which
Delete Account removes (`delete_user`).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
import uuid
from functools import lru_cache
from typing import TYPE_CHECKING, Any
from uuid import UUID

import boto3
import structlog
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from simeon.config import settings

from .connect import ConnectError

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client

log = structlog.get_logger()

#: Fixed for good: every store id is derived under it.
NAMESPACE = UUID("89736dd5-6e5a-49bd-ab12-b6b0b97d0311")

#: The container label saying it was made with backups on, so a box made
#: before is replaced on its volumes (`box_service.ensure`), the way a box
#: on an older host program is.
LABEL = "com.simeonlabs.box-store"
LABEL_VALUE = "1"

#: The host's own names (`box-store-manifest.ts`).
MANIFEST_REL_PATH = "manifest.json"

#: At most this many paths in one presign call (the host sends 500 reads,
#: one write).
MAX_PATHS = 500

#: The upstream's sentence for a server with no store: the host stops
#: asking until it restarts (`connect-errors.ts`).
NOT_ENABLED = "Agent store sync is not enabled on this server."


def enabled() -> bool:
    return bool(settings.BOX_STORE_BUCKET)


# --- ids ---------------------------------------------------------------------


def box_source_id(user_id: UUID | str) -> str:
    """The source the person's box backs up under (`SAND_BOX_STORE_ID`):
    the same for every box the person ever has, so a box made fresh, on any
    server, finds the last one's backup."""
    return str(uuid.uuid5(NAMESPACE, f"box:{user_id}"))


def store_id(user_id: UUID | str, source_id: str) -> str:
    """The store for one person's source: the upstream's `store-<uuid>`."""
    return f"store-{uuid.uuid5(NAMESPACE, f'store:{user_id}:{source_id}')}"


def _valid_source_id(value: str) -> bool:
    """A bare UUID (a box's own source) or a cloud agent's `bc-…` id, the
    two the host mints for (`agent-store-ids.ts`)."""
    if value.startswith("bc-"):
        return 4 < len(value) <= 128 and all(ch.isalnum() or ch == "-" for ch in value)
    try:
        return str(UUID(value)) == value.lower()
    except ValueError:
        return False


# --- the store token ---------------------------------------------------------


def _token_key() -> bytes:
    return hashlib.sha256(f"{settings.SECRET}:box-store".encode()).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def now_ms() -> int:
    return int(time.time() * 1000)


def mint_token(user_id: UUID | str, store_ids: list[str]) -> tuple[str, int]:
    """A token naming the person and the stores it opens, signed with the
    server's secret; the host sends it back as `x-agent-store-token`."""
    expires = now_ms() + int(settings.BOX_STORE_URL_TTL.total_seconds() * 1000)
    body = _b64(
        json.dumps(
            {"u": str(user_id), "s": store_ids, "e": expires}, separators=(",", ":")
        ).encode()
    )
    signature = _b64(hmac.new(_token_key(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}", expires


def read_token(token: str, user_id: UUID | str) -> list[str]:
    """The stores a token opens for this caller; Connect's unauthenticated
    for anything else, which makes the host mint again."""
    body, _, signature = token.partition(".")
    expected = _b64(hmac.new(_token_key(), body.encode(), hashlib.sha256).digest())
    if not body or not hmac.compare_digest(signature, expected):
        raise ConnectError("unauthenticated", "The agent store token is not valid.")
    try:
        payload = json.loads(_unb64(body))
    except ValueError:
        raise ConnectError("unauthenticated", "The agent store token is not valid.")
    if payload.get("u") != str(user_id):
        raise ConnectError("unauthenticated", "The agent store token is not yours.")
    if not isinstance(payload.get("e"), int) or payload["e"] <= now_ms():
        raise ConnectError("unauthenticated", "The agent store token has expired.")
    stores = payload.get("s")
    return [s for s in stores if isinstance(s, str)] if isinstance(stores, list) else []


# --- paths -------------------------------------------------------------------

_WINDOWS_RESERVED = frozenset(
    ["con", "prn", "aux", "nul"]
    + [f"com{n}" for n in range(1, 10)]
    + [f"lpt{n}" for n in range(1, 10)]
)


def normalize_rel_path(rel_path: str) -> str:
    """The host's own rules (`normalizeRelPath`, `agent-store-sand-files.ts`):
    relative, no `..`, no control characters, segments of at most 255
    bytes. Anything else is refused."""
    if not isinstance(rel_path, str) or not rel_path or "\0" in rel_path:
        raise ConnectError("invalid_argument", "A store path is empty or not text.")
    if rel_path.startswith(("/", "\\")) or (len(rel_path) > 1 and rel_path[1] == ":"):
        raise ConnectError("invalid_argument", f"A store path is absolute: {rel_path}")
    segments: list[str] = []
    for segment in rel_path.replace("\\", "/").split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            raise ConnectError("invalid_argument", f"A store path climbs: {rel_path}")
        if len(segment.encode()) > 255 or any(
            ord(ch) < 32 or ord(ch) == 127 for ch in segment
        ):
            raise ConnectError(
                "invalid_argument", f"A store path is malformed: {rel_path}"
            )
        if (
            segment.endswith((".", " "))
            or segment.lower().split(".")[0] in _WINDOWS_RESERVED
        ):
            raise ConnectError(
                "invalid_argument", f"A store path is malformed: {rel_path}"
            )
        segments.append(segment)
    if not segments:
        raise ConnectError("invalid_argument", f"A store path is empty: {rel_path}")
    return "/".join(segments)


def user_prefix(user_id: UUID | str) -> str:
    return f"{settings.BOX_STORE_PREFIX.strip('/')}/{user_id}/"


def object_key(user_id: UUID | str, store: str, rel_path: str) -> str:
    return f"{user_prefix(user_id)}{store}/{rel_path}"


# --- S3 ----------------------------------------------------------------------


@lru_cache(maxsize=1)
def _client() -> S3Client:
    return boto3.client(
        "s3",
        region_name=settings.BOX_STORE_REGION,
        endpoint_url=settings.BOX_STORE_ENDPOINT_URL,
        aws_access_key_id=settings.BOX_STORE_ACCESS_KEY_ID or None,
        aws_secret_access_key=settings.BOX_STORE_SECRET_ACCESS_KEY or None,
        config=Config(
            signature_version="s3v4",
            # The bucket's own address (`bucket_host`); a local S3 in the
            # tests answers on its path.
            s3={
                "addressing_style": "path"
                if settings.BOX_STORE_ENDPOINT_URL
                else "virtual"
            },
            retries={"max_attempts": 3, "mode": "standard"},
        ),
    )


def reset_client_for_tests() -> None:
    _client.cache_clear()


def bucket_host() -> str:
    """The host every presigned URL is on: the bucket's regional,
    virtual-hosted address, which the box allowlists."""
    return f"{settings.BOX_STORE_BUCKET}.s3.{settings.BOX_STORE_REGION}.amazonaws.com"


def _ttl_seconds() -> int:
    return max(60, int(settings.BOX_STORE_URL_TTL.total_seconds()))


def presign_read(key: str) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.BOX_STORE_BUCKET, "Key": key},
        ExpiresIn=_ttl_seconds(),
    )


def presign_write(
    key: str,
    *,
    sha: str,
    expect_absent: bool = False,
    base_etag: str | None = None,
) -> tuple[str, dict[str, str]]:
    """A presigned PUT and the headers the host must send with it, each of
    them signed: the content's sha256 as metadata, and the condition."""
    params: dict[str, Any] = {
        "Bucket": settings.BOX_STORE_BUCKET,
        "Key": key,
        "Metadata": {"content-sha256": sha},
    }
    headers = {"x-amz-meta-content-sha256": sha}
    if expect_absent:
        params["IfNoneMatch"] = "*"
        headers["If-None-Match"] = "*"
    elif base_etag:
        quoted = f'"{base_etag.strip(chr(34))}"'
        params["IfMatch"] = quoted
        headers["If-Match"] = quoted
    url = _client().generate_presigned_url(
        "put_object", Params=params, ExpiresIn=_ttl_seconds()
    )
    return url, headers


def has_backup(user_id: UUID | str) -> bool | None:
    """Whether the person's box has a backup to restore: True, False, or
    None when S3 could not say (the caller then restores, failing closed:
    a box that started empty over a backup would replace its manifest)."""
    key = object_key(
        user_id, store_id(user_id, box_source_id(user_id)), MANIFEST_REL_PATH
    )
    try:
        _client().head_object(Bucket=settings.BOX_STORE_BUCKET, Key=key)
        return True
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        log.warning("sand.box_store.head_failed", user=str(user_id), code=code)
        return None
    except BotoCoreError as error:
        log.warning("sand.box_store.head_failed", user=str(user_id), error=str(error))
        return None


def delete_user(user_id: UUID | str) -> int:
    """Every object of the person's stores (Delete Account). The count
    removed; raises when S3 refuses, so the account deletion says so."""
    return _delete_prefix(user_prefix(user_id))


def clear_box_store(user_id: UUID | str) -> int:
    """The box's own store emptied: the upstream app's reset wipes the
    data and the backup together (`clearStore`, `dev-box-recreate-plane.ts`),
    so a reset computer does not come back with what it was reset from."""
    store = store_id(user_id, box_source_id(user_id))
    return _delete_prefix(f"{user_prefix(user_id)}{store}/")


def _delete_prefix(prefix: str) -> int:
    client = _client()
    removed = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=settings.BOX_STORE_BUCKET, Prefix=prefix):
        keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
        for start in range(0, len(keys), 1000):
            batch = keys[start : start + 1000]
            client.delete_objects(
                Bucket=settings.BOX_STORE_BUCKET,
                Delete={"Objects": batch, "Quiet": True},  # type: ignore[typeddict-item]
            )
            removed += len(batch)
    return removed


# --- what a box is told ------------------------------------------------------


#: When the box copies its backup in (`host/box/box-store-restore.ts`).
RESTORE_MODES = frozenset({"always", "fresh"})


def box_env(user_id: UUID | str, *, restore: str | None) -> dict[str, str]:
    """The settings that switch the box's backups on: the backup itself
    (`SAND_BOX_STORE_SYNC`), the person's store, and the bucket's host for
    the allowlist. With `restore` ("always" or "fresh"), the host copies
    the backup in before it starts, once per container
    (`SIMEON_BOX_STORE_RESTORE_ID`); the copy helper's own switch
    (`SAND_BOX_STORE_COPY_IN`) is set only for its run, by the host."""
    if not enabled():
        return {}
    env = {
        "SAND_BOX_STORE_SYNC": "1",
        "SAND_BOX_STORE_ID": box_source_id(user_id),
        "SIMEON_AGENT_STORE_BUCKET_HOSTS": bucket_host(),
    }
    if restore in RESTORE_MODES:
        env["SIMEON_BOX_STORE_RESTORE"] = str(restore)
        env["SIMEON_BOX_STORE_RESTORE_ID"] = secrets.token_hex(8)
    return env


# --- the three calls -----------------------------------------------------------


def _source_of(message: dict[str, Any]) -> str:
    source = message.get("source")
    if isinstance(source, dict):
        source_id = source.get("sourceId")
        if isinstance(source_id, str) and _valid_source_id(source_id.strip()):
            return (
                source_id.strip().lower()
                if not source_id.startswith("bc-")
                else source_id.strip()
            )
    agent_id = message.get("agentId")
    if isinstance(agent_id, str) and _valid_source_id(agent_id.strip()):
        return agent_id.strip().lower()
    raise ConnectError(
        "invalid_argument", "Name the source of the store (a box or a cloud agent)."
    )


def mint(user_id: UUID | str, message: dict[str, Any]) -> dict[str, Any]:
    """`MintAgentStoreToken`: the store of the source the host names."""
    if not enabled():
        raise ConnectError("permission_denied", NOT_ENABLED)
    store = store_id(user_id, _source_of(message))
    token, expires = mint_token(user_id, [store])
    return {
        "token": token,
        "expiresAtMs": str(expires),
        "agentIds": [],
        "storeIds": [store],
    }


def _store_of(message: dict[str, Any], stores: list[str]) -> str:
    store = message.get("storeId")
    if not isinstance(store, str) or store not in stores:
        raise ConnectError("permission_denied", "That store is not this token's.")
    return store


def presign_reads(
    user_id: UUID | str, token: str, message: dict[str, Any]
) -> dict[str, Any]:
    """`PresignAgentStoreReads`: a GET URL for each path asked."""
    if not enabled():
        raise ConnectError("permission_denied", NOT_ENABLED)
    store = _store_of(message, read_token(token, user_id))
    rel_paths = message.get("relPaths") or []
    if not isinstance(rel_paths, list) or len(rel_paths) > MAX_PATHS:
        raise ConnectError("invalid_argument", f"Ask for at most {MAX_PATHS} paths.")
    expires = str(now_ms() + _ttl_seconds() * 1000)
    instructions = []
    for raw in rel_paths:
        rel_path = normalize_rel_path(raw)
        instructions.append(
            {
                "relPath": raw,
                "url": presign_read(object_key(user_id, store, rel_path)),
                "expiresAtMs": expires,
            }
        )
    return {"instructions": instructions}


def _conflict_rel_path(rel_path: str) -> str:
    return f"{rel_path}.conflict-{now_ms()}-{secrets.token_hex(4)}"


def presign_writes(
    user_id: UUID | str, token: str, message: dict[str, Any]
) -> dict[str, Any]:
    """`PresignAgentStoreWrites`: a PUT URL for each file, in the order
    asked, with its condition and, when it has one, a conflict URL."""
    if not enabled():
        raise ConnectError("permission_denied", NOT_ENABLED)
    store = _store_of(message, read_token(token, user_id))
    files = message.get("files") or []
    if not isinstance(files, list) or len(files) > MAX_PATHS:
        raise ConnectError("invalid_argument", f"Write at most {MAX_PATHS} files.")
    expires = str(now_ms() + _ttl_seconds() * 1000)
    instructions = []
    for entry in files:
        if not isinstance(entry, dict):
            raise ConnectError("invalid_argument", "A file entry is not an object.")
        raw = entry.get("relPath")
        rel_path = normalize_rel_path(raw if isinstance(raw, str) else "")
        sha = entry.get("sha")
        if not isinstance(sha, str) or not sha:
            raise ConnectError("invalid_argument", f"No sha for {rel_path}.")
        expect_absent = entry.get("expectAbsent") is True
        base_etag = entry.get("baseEtag")
        base_etag = base_etag if isinstance(base_etag, str) and base_etag else None
        url, headers = presign_write(
            object_key(user_id, store, rel_path),
            sha=sha,
            expect_absent=expect_absent,
            base_etag=base_etag,
        )
        instruction: dict[str, Any] = {
            "relPath": raw,
            "url": url,
            "headers": headers,
            "expiresAtMs": expires,
        }
        if expect_absent or base_etag:
            conflict_path = _conflict_rel_path(rel_path)
            conflict_url, conflict_headers = presign_write(
                object_key(user_id, store, conflict_path), sha=sha, expect_absent=True
            )
            instruction["conflict"] = {
                "relPath": conflict_path,
                "url": conflict_url,
                "headers": conflict_headers,
                "expiresAtMs": expires,
            }
        instructions.append(instruction)
    return {"instructions": instructions}
