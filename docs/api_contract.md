# MAX Backend API Contract

This document describes the REST API endpoints and WebSocket events provided by the MAX backend for frontend consumption.

## Base URL

- **Development**: `http://localhost:8000`
- **API Prefix**: `/api`
- **WebSocket Endpoint**: `/socket.io/` (Socket.IO protocol)

## Response Format

All REST API responses follow this structure:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

## REST Endpoints

### Sectors

#### `GET /api/sectors`

Get all sectors with summary information.

**Response**: `ApiResponse<SectorSummary[]>`

**SectorSummary**:
```typescript
{
  id: string;
  name: string;
  symbol: string;
  createdAt: string; // ISO 8601 datetime
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  agentsCount: number;
  activeAgentsCount: number;
  discussionsCount: number;
}
```

#### `GET /api/sectors/{sector_id}`

Get a single sector by ID with full details including agents, discussions, and candle data.

**Response**: `ApiResponse<Sector>`

**Sector**:
```typescript
{
  id: string;
  name: string;
  symbol: string;
  createdAt: string; // ISO 8601 datetime
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  agents: Agent[]; // Full agent objects
  discussions: DiscussionSummary[]; // Simplified discussions
  candleData: CandlePoint[]; // Price chart data
}
```

**CandlePoint**:
```typescript
{
  time: string; // Format: "HH:MM" (e.g., "14:30")
  value: number; // Price/index value
}
```

### Agents

#### `GET /api/agents`

Get all agents, optionally filtered by sector and/or status.

**Query Parameters**:
- `sectorId` (optional): Filter by sector ID
- `status` (optional): Filter by agent status (`active`, `idle`, `processing`, `offline`)

**Response**: `ApiResponse<AgentRead[]>`

**AgentRead**:
```typescript
{
  id: string;
  name: string;
  role: string;
  status: "active" | "idle" | "processing" | "offline";
  performance: number;
  trades: number;
  sectorId: string;
  personality: {
    riskTolerance?: string;
    decisionStyle?: string;
    communicationStyle?: string;
    [key: string]: any;
  };
  createdAt: string; // ISO 8601 datetime
  sectorName?: string; // Included in response
  sectorSymbol?: string; // Included in response
}
```

**Example**:
```
GET /api/agents?sectorId=tech-001&status=active
```

### Discussions

#### `GET /api/discussions`

Get all discussions, optionally filtered by sector and/or status.

**Query Parameters**:
- `sectorId` (optional): Filter by sector ID
- `status` (optional): Filter by discussion status (`created`, `active`, `closed`, `archived`)

**Response**: `ApiResponse<DiscussionSummary[]>`

**DiscussionSummary**:
```typescript
{
  id: string;
  sectorId: string;
  sectorSymbol?: string;
  title: string;
  status: "created" | "active" | "closed" | "archived";
  agentIds: string[];
  messagesCount: number;
  updatedAt: string; // ISO 8601 datetime
}
```

**Example**:
```
GET /api/discussions?sectorId=tech-001&status=active
```

#### `GET /api/discussions/{discussion_id}`

Get a single discussion by ID with full message log.

**Response**: `ApiResponse<DiscussionRead>`

**DiscussionRead**:
```typescript
{
  id: string;
  sectorId: string;
  title: string;
  status: "created" | "active" | "closed" | "archived";
  agentIds: string[];
  messages: MessageRead[];
  createdAt: string; // ISO 8601 datetime
  updatedAt: string; // ISO 8601 datetime
}
```

**MessageRead**:
```typescript
{
  id: string;
  discussionId: string;
  agentId: string | null;
  agentName: string;
  content: string;
  timestamp: string; // ISO 8601 datetime
}
```

## WebSocket Events

The backend uses Socket.IO for real-time communication. Connect to `/socket.io/` endpoint.

### Connection

**Event**: `connect`

Client connects to the WebSocket server.

**Event**: `connected` (server → client)

Server confirms connection.

**Payload**:
```typescript
{
  message: string; // e.g., "Connected to MAX realtime server"
}
```

### Market Updates

**Event**: `market:update` (server → client)

Broadcast when market data changes (global index or sector-specific).

**Payload**:
```typescript
{
  timestamp: string; // ISO 8601 datetime
  sectorId?: string; // If sector-specific update
  value?: number; // Sector price/index value
  indexValue?: number; // Global market index value
}
```

**Example**:
```typescript
// Sector-specific update
{
  timestamp: "2025-01-15T10:30:00Z",
  sectorId: "tech-001",
  value: 1250.50
}

// Global index update
{
  timestamp: "2025-01-15T10:30:00Z",
  indexValue: 15234.67
}
```

### Sector Candle Updates

**Event**: `sector:candle_update` (server → client)

Broadcast when new candle data is available for a sector.

**Payload**:
```typescript
{
  sectorId: string;
  candle: {
    time: string; // Format: "HH:MM"
    value: number; // Price/index value
  };
}
```

**Example**:
```typescript
{
  sectorId: "tech-001",
  candle: {
    time: "14:30",
    value: 1250.50
  }
}
```

### Discussion Messages

**Event**: `discussion:new_message` (server → client)

Broadcast when a new message is posted in a discussion.

**Payload**:
```typescript
{
  discussionId: string;
  message: {
    id: string;
    discussionId: string;
    agentId: string | null;
    agentName: string;
    content: string;
    timestamp: string; // ISO 8601 datetime
  };
}
```

**Example**:
```typescript
{
  discussionId: "disc-123",
  message: {
    id: "msg-456",
    discussionId: "disc-123",
    agentId: "agent-789",
    agentName: "Trader Agent",
    content: "I recommend buying at current levels.",
    timestamp: "2025-01-15T10:30:00Z"
  }
}
```

### Agent Status Updates

**Event**: `agent:status_update` (server → client)

Broadcast when an agent's status changes.

**Payload**:
```typescript
{
  agentId: string;
  status: "active" | "idle" | "processing" | "offline";
  sectorId?: string; // Optional sector ID
}
```

**Example**:
```typescript
{
  agentId: "agent-789",
  status: "processing",
  sectorId: "tech-001"
}
```

## Frontend Integration Guide

### TypeScript Types

Use the types defined in `frontend/src/lib/types.ts` for type safety:

- `AgentStatus`: `"active" | "idle" | "processing" | "offline"`
- `DiscussionStatus`: `"created" | "active" | "closed" | "archived"`
- `Agent`, `AgentWithSectorMeta`
- `Discussion`, `DiscussionSummary`
- `Sector`, `SectorSummary`
- `Message`
- `CandlePoint`
- `AgentPersonality`

### API Client

Use the typed API client functions from `frontend/src/lib/api.ts`:

- `getSectors(): Promise<SectorSummary[]>`
- `getSectorById(id: string): Promise<Sector>`
- `getAgents(params?: { sectorId?: string; status?: AgentStatus }): Promise<AgentWithSectorMeta[]>`
- `getDiscussions(params?: { sectorId?: string; status?: DiscussionStatus }): Promise<DiscussionSummary[]>`
- `getDiscussionById(id: string): Promise<Discussion>`

### WebSocket Client

See `frontend/src/lib/realtime.ts` for WebSocket event type definitions and implementation guidance.

**Example Socket.IO client setup**:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8000', {
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('Connected to MAX realtime server');
});

socket.on('market:update', (data) => {
  // Handle market update
  console.log('Market update:', data);
});

socket.on('sector:candle_update', (data) => {
  // Handle candle update
  console.log('Candle update:', data);
});

socket.on('discussion:new_message', (data) => {
  // Handle new message
  console.log('New message:', data);
});

socket.on('agent:status_update', (data) => {
  // Handle agent status update
  console.log('Agent status update:', data);
});
```

## Error Handling

All API endpoints return errors in the standard `ApiResponse` format:

```typescript
{
  success: false,
  error: "Error message describing what went wrong"
}
```

HTTP status codes:
- `200`: Success
- `404`: Resource not found
- `500`: Internal server error

The API client functions in `frontend/src/lib/api.ts` automatically handle error responses and throw descriptive errors.

## Environment Configuration

Configure the API base URL via environment variables:

- `NEXT_PUBLIC_API_BASE_URL` (for Next.js)
- `VITE_API_BASE_URL` (for Vite)

Default: `http://localhost:8000`

## Notes

- All datetime fields are ISO 8601 format strings (e.g., `"2025-01-15T10:30:00Z"`)
- All IDs are UUID strings
- The backend uses camelCase for field names (e.g., `sectorId`, `createdAt`)
- WebSocket events are broadcast to all connected clients (no room-based filtering yet)

