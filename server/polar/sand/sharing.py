"""Stub, 25 September 2026: filled by the sharing build. See
docs/product/cursor-dependencies-map.md for the contract it serves."""

from __future__ import annotations

from polar.openapi import APITag
from polar.routing import APIRouter

router = APIRouter(tags=["sand", APITag.private], include_in_schema=False)
