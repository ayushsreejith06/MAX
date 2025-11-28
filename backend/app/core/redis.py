"""
Redis client and pub/sub helpers for MAX backend.

Provides async Redis client and pub/sub functionality for coordinating
realtime events across multiple processes/workers.
"""

import redis.asyncio as aioredis
from typing import Optional
from app.core.config import settings

# Global Redis client instance
_redis_client: Optional[aioredis.Redis] = None
_pubsub: Optional[aioredis.client.PubSub] = None


async def get_redis() -> aioredis.Redis:
    """
    Get or create the Redis client instance.
    
    Returns:
        Redis client instance (async)
    """
    global _redis_client
    
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    
    return _redis_client


async def get_pubsub() -> aioredis.client.PubSub:
    """
    Get or create a Redis pub/sub instance.
    
    Returns:
        PubSub instance for subscribing to channels
    """
    global _pubsub
    
    if _pubsub is None:
        redis_client = await get_redis()
        _pubsub = redis_client.pubsub()
    
    return _pubsub


async def close_redis():
    """Close Redis connections (for cleanup)."""
    global _redis_client, _pubsub
    
    if _pubsub:
        await _pubsub.close()
        _pubsub = None
    
    if _redis_client:
        await _redis_client.close()
        _redis_client = None

