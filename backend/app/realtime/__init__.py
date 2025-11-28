"""
Realtime WebSocket/Socket.IO module for MAX backend.

Provides realtime broadcasting capabilities for:
- Market updates
- Sector candle updates
- Discussion messages
- Agent status changes
"""

from .socket import (
    sio,
    broadcastMarketUpdate,
    broadcastSectorCandleUpdate,
    broadcastNewMessage,
    broadcastAgentStatusUpdate,
)

__all__ = [
    "sio",
    "broadcastMarketUpdate",
    "broadcastSectorCandleUpdate",
    "broadcastNewMessage",
    "broadcastAgentStatusUpdate",
]
