"""Standalone tests for the Resend webhook signature verifier.

These don't need the DB or app fixtures — the verifier is a pure
function. We test it standalone so signature/replay regressions are
caught even when broader infra tests can't run.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import time

import pytest

from polar.integrations.resend.endpoints import _verify_svix_signature


def _sign(payload: bytes, msg_id: str, ts: str, secret_b64: str) -> str:
    """Reproduce Svix's signature scheme for use in tests."""
    raw_secret = base64.b64decode(secret_b64.removeprefix("whsec_"))
    signed = f"{msg_id}.{ts}.".encode() + payload
    sig = base64.b64encode(hmac.new(raw_secret, signed, hashlib.sha256).digest()).decode()
    return f"v1,{sig}"


@pytest.fixture
def secret() -> str:
    # 32 random bytes b64-encoded — same shape as a real Resend secret.
    return "whsec_" + base64.b64encode(b"\x00" * 32).decode()


def test_valid_signature_passes(secret: str) -> None:
    payload = b'{"type": "email.opened", "data": {"email_id": "abc"}}'
    msg_id = "msg_test"
    ts = str(int(time.time()))
    sig = _sign(payload, msg_id, ts, secret)

    assert (
        _verify_svix_signature(
            payload=payload,
            msg_id=msg_id,
            msg_timestamp=ts,
            msg_signature=sig,
            secret=secret,
        )
        is True
    )


def test_tampered_payload_rejected(secret: str) -> None:
    payload = b'{"type": "email.opened"}'
    msg_id = "msg_test"
    ts = str(int(time.time()))
    sig = _sign(payload, msg_id, ts, secret)

    # Same signature, mutated payload.
    assert (
        _verify_svix_signature(
            payload=b'{"type": "email.clicked"}',
            msg_id=msg_id,
            msg_timestamp=ts,
            msg_signature=sig,
            secret=secret,
        )
        is False
    )


def test_replay_outside_tolerance_rejected(secret: str) -> None:
    payload = b'{}'
    msg_id = "msg_replay"
    # 10 minutes ago — outside the 5-minute Svix tolerance window.
    ts = str(int(time.time()) - 10 * 60)
    sig = _sign(payload, msg_id, ts, secret)

    assert (
        _verify_svix_signature(
            payload=payload,
            msg_id=msg_id,
            msg_timestamp=ts,
            msg_signature=sig,
            secret=secret,
        )
        is False
    )


def test_empty_secret_returns_false(secret: str) -> None:
    payload = b'{}'
    msg_id = "msg_test"
    ts = str(int(time.time()))
    sig = _sign(payload, msg_id, ts, secret)

    assert (
        _verify_svix_signature(
            payload=payload,
            msg_id=msg_id,
            msg_timestamp=ts,
            msg_signature=sig,
            secret="",
        )
        is False
    )


def test_multiple_signature_versions_any_match(secret: str) -> None:
    """Svix rotates secrets by sending both old and new signatures."""
    payload = b'{}'
    msg_id = "msg_test"
    ts = str(int(time.time()))
    good_sig = _sign(payload, msg_id, ts, secret)
    bad_sig = "v1,unrelated"
    combined = f"{bad_sig} {good_sig}"

    assert (
        _verify_svix_signature(
            payload=payload,
            msg_id=msg_id,
            msg_timestamp=ts,
            msg_signature=combined,
            secret=secret,
        )
        is True
    )


def test_non_v1_versions_skipped(secret: str) -> None:
    payload = b'{}'
    msg_id = "msg_test"
    ts = str(int(time.time()))
    sig = _sign(payload, msg_id, ts, secret)
    # Replace v1 with v2 — verifier should ignore non-v1 entries.
    v2_only = sig.replace("v1,", "v2,")

    assert (
        _verify_svix_signature(
            payload=payload,
            msg_id=msg_id,
            msg_timestamp=ts,
            msg_signature=v2_only,
            secret=secret,
        )
        is False
    )


def test_bad_timestamp_rejected(secret: str) -> None:
    payload = b'{}'
    msg_id = "msg_test"
    sig = _sign(payload, msg_id, "123", secret)

    assert (
        _verify_svix_signature(
            payload=payload,
            msg_id=msg_id,
            msg_timestamp="not-an-int",
            msg_signature=sig,
            secret=secret,
        )
        is False
    )
