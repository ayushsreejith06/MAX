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

## Redis Setup

The MAX backend uses Redis as a message bus for coordinating realtime events across multiple processes/workers. This enables background workers (like market simulators) to publish updates that are then broadcast to WebSocket clients.

### Configuration

Redis connection is configured via the `REDIS_URL` environment variable:

```bash
export REDIS_URL="redis://localhost:6379/0"
```

Default (for local development):
```
redis://localhost:6379/0
```

You can also add it to your `.env` file in the `backend/` directory:
```
REDIS_URL=redis://localhost:6379/0
```

### Running Redis Locally

#### Option 1: Docker (Recommended)

```bash
docker run -d --name redis-max -p 6379:6379 redis:7-alpine
```

#### Option 2: Docker Compose

Create a `docker-compose.yml` in the project root:

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

Then run:
```bash
docker-compose up -d redis
```

#### Option 3: Local Installation

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server
```

**Windows:**
Download and install from [Redis for Windows](https://github.com/microsoftarchive/redis/releases) or use WSL.

### Redis Pub/Sub Channels

The backend uses the following Redis channels for realtime events:

- **`market_updates`** - Market index and sector value updates
- **`sector_candles`** - Sector candle/OHLC data updates
- **`discussion_messages`** - New messages in discussion rooms
- **`agent_status`** - Agent status changes (active, idle, processing, etc.)

### Message Format

All messages published to Redis channels are JSON-encoded strings with camelCase keys for frontend compatibility. The WebSocket server automatically subscribes to these channels and broadcasts received messages to connected clients.

### Publishing Events to Redis

Background workers and other processes can publish events using the helper functions:

```python
from app.realtime.publish import (
    publish_market_update,
    publish_sector_candle,
    publish_discussion_message,
    publish_agent_status,
)

# Publish market update
await publish_market_update(
    sectorId="tech-001",
    indexValue=1250.50
)

# Publish sector candle
await publish_sector_candle(
    sectorId="tech-001",
    candle={
        "timestamp": "2025-01-15T10:30:00.000Z",
        "value": 1250.50,
        "open": 1245.00,
        "high": 1255.00,
        "low": 1240.00,
        "close": 1250.50
    }
)

# Publish discussion message
await publish_discussion_message(
    discussionId="disc-123",
    message={
        "id": "msg-456",
        "content": "Hello!",
        "authorId": "agent-789",
        "timestamp": "2025-01-15T10:30:00.000Z"
    }
)

# Publish agent status
await publish_agent_status(
    agentId="agent-789",
    sectorId="tech-001",
    status="active"
)
```

## Database Setup

The MAX backend uses PostgreSQL with SQLAlchemy ORM and Alembic for migrations.

### Configuration

Database connection is configured via the `DATABASE_URL` environment variable:

```bash
export DATABASE_URL="postgresql+psycopg2://user:password@localhost:5432/max"
```

Default (for local development):
```
postgresql+psycopg2://postgres:postgres@localhost:5432/max
```

You can also create a `.env` file in the `backend/` directory:
```
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/max
```

### Running Migrations

To apply database migrations:

```bash
# Apply all pending migrations
alembic upgrade head

# Create a new migration (after model changes)
alembic revision --autogenerate -m "Description of changes"

# Rollback one migration
alembic downgrade -1

# View current migration status
alembic current

# View migration history
alembic history
```

### TimescaleDB Support

The `sector_candles` table is designed to be TimescaleDB-compatible. To convert it to a hypertable in production:

```sql
-- Run this SQL command after migrations (requires TimescaleDB extension)
SELECT create_hypertable('sector_candles', 'timestamp');
```

**Note:** TimescaleDB hypertable conversion is a deployment concern and not required for local development. The table structure is compatible with both standard PostgreSQL and TimescaleDB.

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

There are two ways to broadcast events:

#### 1. Direct Broadcasting (Single Process)

For broadcasting from within the same process as the WebSocket server:

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

#### 2. Redis Publishing (Multi-Process/Background Workers)

For publishing from background workers or separate processes, use the Redis publish helpers (see Redis Setup section above). The WebSocket server automatically subscribes to Redis channels and broadcasts messages to connected clients.

## Architecture

### Realtime Module

The `app/realtime/` module provides:
- Socket.IO server instance (`sio`)
- Direct broadcasting helper functions (for same-process use)
- Redis pub/sub integration for multi-process coordination
- Connection management

**Architecture:**
- The WebSocket server automatically subscribes to Redis pub/sub channels on startup
- Background workers can publish events to Redis channels
- The WebSocket server receives Redis messages and broadcasts them to connected clients
- This enables horizontal scaling across multiple processes/workers

## Development

### Project Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entrypoint
│   ├── api/                 # REST API routers
│   ├── core/                # Core configuration (db, settings, redis)
│   │   ├── config.py        # Application settings
│   │   └── redis.py         # Redis client helpers
│   ├── models/              # Data models
│   └── realtime/            # WebSocket/Socket.IO module
│       ├── __init__.py
│       ├── socket.py        # Socket.IO server and broadcast functions
│       ├── publish.py       # Redis publish helpers
│       └── channels.py      # Redis channel name constants
├── requirements.txt
└── README.md
```

## Notes

- CORS is currently configured to allow all origins (`*`). Configure appropriately for production.
- The Socket.IO server automatically subscribes to Redis pub/sub channels on startup for multi-process coordination.
- All timestamps are in ISO 8601 format with UTC timezone (ending in 'Z').
- Redis is required for the backend to function properly. Make sure Redis is running before starting the server.
