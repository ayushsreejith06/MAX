# MAX Backend

Backend API and realtime WebSocket server for the MAX platform.

## Overview

The MAX backend provides:
- REST API endpoints for sectors, agents, and discussions
- WebSocket/Socket.IO realtime updates for market data, messages, and agent status

## Installation

```bash
pip install -r requirements.txt
```

## Running the Server

```bash
# Development mode
uvicorn app.main:asgi_app --reload --host 0.0.0.0 --port 8000

# Or using the main module directly
python -m app.main
```

## API Endpoints

### REST API

- `GET /health` - Health check endpoint
- `/api/sectors` - Sector management endpoints
- `/api/agents` - Agent management endpoints
- `/api/discussions` - Discussion room endpoints

## WebSocket / Socket.IO

### Connection

Connect to the Socket.IO server at:
```
ws://localhost:8000/socket.io/
```

The server uses Socket.IO protocol, compatible with `socket.io-client` libraries.

### Events

#### Outbound Events (Server → Client)

##### `market:update`
Broadcasts market updates for sectors or global index.

**Payload:**
```json
{
  "sectorId": "string (optional)",
  "value": "number (optional, for sector-specific)",
  "indexValue": "number (optional, for global index)",
  "timestamp": "ISO 8601 string"
}
```

**Example:**
```json
{
  "sectorId": "tech-001",
  "value": 1250.50,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

##### `sector:candle_update`
Broadcasts candle/OHLC updates for a specific sector.

**Payload:**
```json
{
  "sectorId": "string",
  "candle": {
    "timestamp": "ISO 8601 string",
    "value": "number",
    "open": "number (optional)",
    "high": "number (optional)",
    "low": "number (optional)",
    "close": "number (optional)"
  }
}
```

**Example:**
```json
{
  "sectorId": "tech-001",
  "candle": {
    "timestamp": "2025-01-15T10:30:00.000Z",
    "value": 1250.50,
    "open": 1245.00,
    "high": 1255.00,
    "low": 1240.00,
    "close": 1250.50
  }
}
```

##### `discussion:new_message`
Broadcasts new messages in discussion rooms.

**Payload:**
```json
{
  "discussionId": "string",
  "message": {
    "id": "string",
    "content": "string",
    "authorId": "string",
    "authorName": "string",
    "timestamp": "ISO 8601 string",
    "type": "string"
  }
}
```

**Example:**
```json
{
  "discussionId": "disc-123",
  "message": {
    "id": "msg-456",
    "content": "I think we should buy more tech stocks",
    "authorId": "agent-789",
    "authorName": "TradingBot",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "type": "text"
  }
}
```

##### `agent:status_update`
Broadcasts agent status changes.

**Payload:**
```json
{
  "agentId": "string",
  "sectorId": "string (optional)",
  "status": "string"
}
```

**Status values:** `"active"`, `"idle"`, `"processing"`, `"error"`, etc.

**Example:**
```json
{
  "agentId": "agent-789",
  "sectorId": "tech-001",
  "status": "active"
}
```

#### Inbound Events (Client → Server)

Currently, the server only handles connection/disconnection events. Additional client events can be added as needed.

### Usage Example (JavaScript/TypeScript)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8000', {
  path: '/socket.io/'
});

socket.on('connect', () => {
  console.log('Connected to MAX realtime server');
});

socket.on('market:update', (data) => {
  console.log('Market update:', data);
});

socket.on('sector:candle_update', (data) => {
  console.log('Candle update:', data);
});

socket.on('discussion:new_message', (data) => {
  console.log('New message:', data);
});

socket.on('agent:status_update', (data) => {
  console.log('Agent status:', data);
});
```

### Broadcasting Events (Server-Side)

To broadcast events from your application code:

```python
from app.realtime import (
    broadcastMarketUpdate,
    broadcastSectorCandleUpdate,
    broadcastNewMessage,
    broadcastAgentStatusUpdate,
)

# Broadcast market update
await broadcastMarketUpdate(
    sectorId="tech-001",
    indexValue=1250.50
)

# Broadcast candle update
await broadcastSectorCandleUpdate(
    sectorId="tech-001",
    candle={
        "timestamp": "2025-01-15T10:30:00.000Z",
        "value": 1250.50
    }
)

# Broadcast new message
await broadcastNewMessage(
    discussionId="disc-123",
    message={
        "id": "msg-456",
        "content": "Hello!",
        "authorId": "agent-789",
        "timestamp": "2025-01-15T10:30:00.000Z"
    }
)

# Broadcast agent status
await broadcastAgentStatusUpdate(
    agentId="agent-789",
    sectorId="tech-001",
    status="active"
)
```

## Architecture

### Realtime Module

The `app/realtime/` module provides:
- Socket.IO server instance (`sio`)
- Broadcasting helper functions
- Connection management

Currently operates in single-process mode. Future enhancements will include Redis pub/sub for multi-process scaling.

## Development

### Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entrypoint
│   ├── api/                 # REST API routers
│   ├── core/                # Core configuration (db, settings)
│   ├── models/              # Data models
│   └── realtime/            # WebSocket/Socket.IO module
│       ├── __init__.py
│       └── socket.py        # Socket.IO server and broadcast functions
├── requirements.txt
└── README.md
```

## Notes

- CORS is currently configured to allow all origins (`*`). Configure appropriately for production.
- The Socket.IO server operates in single-process mode. For production scaling, consider Redis pub/sub integration.
- All timestamps are in ISO 8601 format with UTC timezone (ending in 'Z').
