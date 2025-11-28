"""
Redis publish helpers for realtime events.

Provides helper functions to publish events to Redis pub/sub channels.
These functions serialize payloads to JSON using camelCase keys for frontend compatibility.
"""

import json
from typing import Optional, Dict, Any
from datetime import datetime
from app.core.redis import get_redis
from app.realtime.channels import (
    CHANNEL_MARKET_UPDATES,
    CHANNEL_SECTOR_CANDLES,
    CHANNEL_DISCUSSION_MESSAGES,
    CHANNEL_AGENT_STATUS,
)


async def publish_market_update(
    sectorId: Optional[str] = None,
    indexValue: Optional[float] = None,
    timestamp: Optional[str] = None,
) -> None:
    """
    Publish a market update to Redis.
    
    Args:
        sectorId: Optional sector ID for sector-specific updates
        indexValue: Optional global index value
        timestamp: ISO format timestamp (defaults to current time)
    """
    if timestamp is None:
        timestamp = datetime.utcnow().isoformat() + "Z"
    
    payload: Dict[str, Any] = {
        "timestamp": timestamp,
    }
    
    if sectorId is not None:
        payload["sectorId"] = sectorId
        payload["value"] = indexValue  # Value for this sector
    elif indexValue is not None:
        payload["indexValue"] = indexValue
    
    redis_client = await get_redis()
    await redis_client.publish(CHANNEL_MARKET_UPDATES, json.dumps(payload))
    print(f"Published market update to Redis: {payload}")


async def publish_sector_candle(
    sectorId: str,
    candle: Dict[str, Any],
) -> None:
    """
    Publish a sector candle update to Redis.
    
    Args:
        sectorId: The sector ID
        candle: Candle data with timestamp and value (camelCase keys)
    """
    payload = {
        "sectorId": sectorId,
        "candle": candle,
    }
    
    redis_client = await get_redis()
    await redis_client.publish(CHANNEL_SECTOR_CANDLES, json.dumps(payload))
    print(f"Published sector candle update to Redis for sector {sectorId}: {candle}")


async def publish_discussion_message(
    discussionId: str,
    message: Dict[str, Any],
) -> None:
    """
    Publish a new discussion message to Redis.
    
    Args:
        discussionId: The discussion room ID
        message: Message data (camelCase keys for frontend)
    """
    payload = {
        "discussionId": discussionId,
        "message": message,
    }
    
    redis_client = await get_redis()
    await redis_client.publish(CHANNEL_DISCUSSION_MESSAGES, json.dumps(payload))
    print(f"Published discussion message to Redis for discussion {discussionId}")


async def publish_agent_status(
    agentId: str,
    sectorId: Optional[str],
    status: str,
) -> None:
    """
    Publish an agent status update to Redis.
    
    Args:
        agentId: The agent ID
        sectorId: Optional sector ID the agent is associated with
        status: The new status (e.g., "active", "idle", "processing")
    """
    payload = {
        "agentId": agentId,
        "status": status,
    }
    
    if sectorId is not None:
        payload["sectorId"] = sectorId
    
    redis_client = await get_redis()
    await redis_client.publish(CHANNEL_AGENT_STATUS, json.dumps(payload))
    print(f"Published agent status update to Redis for agent {agentId}: {status}")
