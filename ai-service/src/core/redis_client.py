"""
Redis client for caching and session management.
"""

import json
from typing import Any, Optional
import redis.asyncio as redis

from src.core.config import get_settings

settings = get_settings()

# Global Redis client
redis_client: Optional[redis.Redis] = None


async def init_redis():
    """Initialize Redis connection."""
    global redis_client
    redis_client = redis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
    )
    
    # Test connection
    await redis_client.ping()


async def get_redis() -> redis.Redis:
    """Get Redis client."""
    if redis_client is None:
        await init_redis()
    return redis_client


async def cache_set(key: str, value: Any, expire: int = 3600) -> bool:
    """Set value in cache with expiration."""
    client = await get_redis()
    serialized_value = json.dumps(value) if not isinstance(value, str) else value
    return await client.setex(key, expire, serialized_value)


async def cache_get(key: str) -> Optional[Any]:
    """Get value from cache."""
    client = await get_redis()
    value = await client.get(key)
    if value is None:
        return None
    
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


async def cache_delete(key: str) -> bool:
    """Delete key from cache."""
    client = await get_redis()
    return bool(await client.delete(key))