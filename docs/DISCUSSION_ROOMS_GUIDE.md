# Discussion Rooms Guide

## Overview

Discussion rooms are dedicated spaces where agents can discuss, negotiate, and coordinate trading strategies. The system automatically creates and manages discussion rooms through an auto-loop that runs every 15 seconds.

## Status

✅ **Fully Implemented and Working**

### Backend
- ✅ DiscussionRoom model with full lifecycle
- ✅ REST API endpoints at `/api/discussions`
- ✅ Auto-discussion loop (runs every 15 seconds)
- ✅ Storage persistence
- ✅ Integration with ManagerAgent

### Frontend
- ✅ Discussion list page (`/discussions`)
- ✅ Discussion detail page (`/discussions/[id]`)
- ✅ Integration with sector pages
- ✅ Real-time message display
- ✅ Status management (accept/reject/close/archive)

## How to View Discussions

### Backend API

#### List All Discussions
```bash
GET http://localhost:8000/api/discussions
```

Response:
```json
[
  {
    "id": "uuid",
    "sectorId": "sector-id",
    "title": "Discussion: Sector Name - Auto-triggered discussion",
    "status": "in_progress",
    "agentIds": ["agent-id-1", "agent-id-2"],
    "messages": [
      {
        "id": "msg-id",
        "agentId": "agent-id",
        "agentName": "Agent Name",
        "content": "Message content",
        "timestamp": "2024-01-01T00:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

#### Get Single Discussion
```bash
GET http://localhost:8000/api/discussions/:id
```

#### Filter by Sector
```bash
GET http://localhost:8000/api/discussions?sectorId=sector-id
```

#### Create Discussion
```bash
POST http://localhost:8000/api/discussions
Content-Type: application/json

{
  "sectorId": "sector-id",
  "title": "Discussion Title",
  "agentIds": ["agent-id-1", "agent-id-2"] // Optional
}
```

#### Add Message to Discussion
```bash
POST http://localhost:8000/api/discussions/:id/message
Content-Type: application/json

{
  "agentId": "agent-id",
  "content": "Message content",
  "role": "agent",
  "agentName": "Agent Name" // Optional
}
```

#### Close Discussion
```bash
POST http://localhost:8000/api/discussions/:id/close
```

#### Archive Discussion
```bash
POST http://localhost:8000/api/discussions/:id/archive
```

#### Accept Discussion
```bash
POST http://localhost:8000/api/discussions/:id/accept
```

#### Reject Discussion
```bash
POST http://localhost:8000/api/discussions/:id/reject
```

### Frontend UI

#### Discussion List Page
1. Navigate to `/discussions` in your browser
2. View all discussions in a table format
3. Filter by:
   - Status: All, In Progress, Accepted, Rejected
   - Sector: All sectors or specific sector
4. Click on any discussion row to view details

#### Discussion Detail Page
1. Navigate to `/discussions/:id` or click a discussion from the list
2. View:
   - Discussion title and metadata
   - Status badge
   - Participants list
   - All messages in chronological order
3. Actions available:
   - **Accept** (if in_progress)
   - **Reject** (if in_progress)
   - **Close** (if in_progress)
   - **Archive** (if closed/accepted/rejected)
   - **Add Message** (if in_progress)
   - **Refresh** (reload discussion data)

#### Sector Integration
1. Navigate to `/sectors/:id`
2. Scroll to the "Discussions" section
3. View all discussions for that sector
4. Click on a discussion to navigate to detail page

## Discussion Lifecycle

### Status Flow
```
created → in_progress → decided → closed → archived
                ↓
            accepted/rejected
```

### Auto-Discussion Loop

The system automatically:
1. **Creates** new discussions for sectors with 2+ agents (if no recent discussion exists)
2. **Collects** arguments from agents when a discussion is created
3. **Produces** decisions when discussions have messages but no decision
4. **Closes** discussions after decisions are made
5. **Archives** discussions that have been closed for more than 1 minute

The loop runs every **15 seconds** and is started automatically when the backend server starts.

## Discussion States

- **`created`**: Discussion room created but no messages yet
- **`in_progress`**: Active discussion with messages
- **`decided`**: Decision has been made
- **`closed`**: Discussion is closed
- **`accepted`**: Discussion was accepted
- **`rejected`**: Discussion was rejected
- **`archived`**: Discussion is archived

## Storage

Discussions are persisted in:
- **Development**: `backend/storage/discussions.json`
- **Desktop App**: Platform-specific app data directory

The storage file is automatically created if it doesn't exist.

## Testing Discussion Rooms

### Manual Testing

1. **Create a Discussion via API**:
   ```bash
   curl -X POST http://localhost:8000/api/discussions \
     -H "Content-Type: application/json" \
     -d '{
       "sectorId": "your-sector-id",
       "title": "Test Discussion"
     }'
   ```

2. **Add a Message**:
   ```bash
   curl -X POST http://localhost:8000/api/discussions/DISCUSSION-ID/message \
     -H "Content-Type: application/json" \
     -d '{
       "agentId": "your-agent-id",
       "content": "This is a test message",
       "role": "agent"
     }'
   ```

3. **View in Frontend**:
   - Navigate to `/discussions`
   - Find your test discussion
   - Click to view details

### Automatic Testing

The auto-discussion loop will automatically:
- Create discussions for sectors with agents
- Process existing discussions through their lifecycle
- Archive old discussions

Monitor the backend console logs to see the loop in action:
```
[DiscussionLifecycle] Starting auto-discussion loop (interval: 15000ms)
[DiscussionLifecycle] Started discussion <id> for sector <sector-id>
[DiscussionLifecycle] Decision produced for discussion <id>: BUY (confidence: 0.75)
```

## Troubleshooting

### No Discussions Appearing

1. **Check if sectors have agents**:
   - Discussions are only created for sectors with 2+ agents
   - Verify agents exist: `GET /api/agents`

2. **Check auto-loop is running**:
   - Look for log: `Discussion lifecycle auto-loop initialized and started successfully`
   - Check backend console for loop activity

3. **Check storage file**:
   - Verify `backend/storage/discussions.json` exists
   - Check file permissions

### Discussions Not Updating

1. **Refresh the page** - Frontend doesn't auto-refresh
2. **Check backend logs** - Look for errors in discussion lifecycle
3. **Verify API endpoints** - Test endpoints directly with curl/Postman

### Messages Not Appearing

1. **Check agent IDs** - Ensure agentIds in discussion match actual agents
2. **Verify message format** - Check API request body matches expected format
3. **Check discussion status** - Messages can only be added to `in_progress` discussions

## API Response Format

All discussion endpoints return discussions in this format:

```typescript
interface Discussion {
  id: string;
  sectorId: string;
  title: string;
  status: 'created' | 'in_progress' | 'decided' | 'closed' | 'accepted' | 'rejected' | 'archived';
  agentIds: string[];
  messages: Array<{
    id: string;
    agentId: string;
    agentName: string;
    content: string;
    role: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
  // Decision fields (if decided)
  finalDecision?: string;
  rationale?: string;
  confidence?: number;
  selectedAgent?: string;
  voteBreakdown?: { BUY: number; SELL: number; HOLD: number };
  conflictScore?: number;
  decidedAt?: string;
}
```

