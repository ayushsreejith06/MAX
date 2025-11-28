"""
Socket.IO server and broadcasting functions for realtime updates.

This module provides a Socket.IO server instance and helper functions
to broadcast events to connected clients.
"""

import socketio
from typing import Optional, Dict, Any
from datetime import datetime

# Create Socket.IO server instance
# Using ASGI mode for FastAPI integration
sio = socketio.AsyncServer(
    cors_allowed_origins="*",  # Configure appropriately for production
    async_mode="asgi",
)

# Store connected clients (for single-process operation)
# In the future, this can be replaced with Redis pub/sub
_connected_clients: set = set()


@sio.event
async def connect(sid: str, environ: Dict[str, Any], auth: Optional[Dict[str, Any]]):
    """Handle client connection."""
    _connected_clients.add(sid)
    print(f"Client connected: {sid}")
    await sio.emit("connected", {"message": "Connected to MAX realtime server"}, room=sid)


@sio.event
async def disconnect(sid: str):
    """Handle client disconnection."""
    _connected_clients.discard(sid)
    print(f"Client disconnected: {sid}")


async def broadcastMarketUpdate(
    sectorId: Optional[str] = None,
    indexValue: Optional[float] = None,
    timestamp: Optional[str] = None,
) -> None:
    """
    Broadcast a market update event.
    
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
    
    await sio.emit("market:update", payload)
    print(f"Broadcasted market update: {payload}")


async def broadcastSectorCandleUpdate(
    sectorId: str,
    candle: Dict[str, Any],
) -> None:
    """
    Broadcast a sector candle update event.
    
    Args:
        sectorId: The sector ID
        candle: Candle data with timestamp and value
    """
    payload = {
        "sectorId": sectorId,
        "candle": candle,
    }
    
    await sio.emit("sector:candle_update", payload)
    print(f"Broadcasted candle update for sector {sectorId}: {candle}")


async def broadcastNewMessage(
    discussionId: str,
    message: Dict[str, Any],
) -> None:
    """
    Broadcast a new discussion message event.
    
    Args:
        discussionId: The discussion room ID
        message: Message data (MessageRead format)
    """
    payload = {
        "discussionId": discussionId,
        "message": message,
    }
    
    await sio.emit("discussion:new_message", payload)
    print(f"Broadcasted new message in discussion {discussionId}")


async def broadcastAgentStatusUpdate(
    agentId: str,
    sectorId: Optional[str],
    status: str,
) -> None:
    """
    Broadcast an agent status update event.
    
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
    
    await sio.emit("agent:status_update", payload)
    print(f"Broadcasted status update for agent {agentId}: {status}")

