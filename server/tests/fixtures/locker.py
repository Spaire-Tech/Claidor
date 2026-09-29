import pytest_asyncio

from simeon.locker import Locker
from simeon.redis import Redis


@pytest_asyncio.fixture
async def locker(redis: Redis) -> Locker:
    return Locker(redis)
