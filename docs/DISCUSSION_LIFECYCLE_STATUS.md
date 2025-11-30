# Discussion Lifecycle Status

## ✅ Complete Implementation

The full discussion lifecycle is now fully implemented and enhanced with real agent reasoning.

## Lifecycle Stages

### 1. ✅ CREATE
- **Function**: `startDiscussion()`
- **Status**: Fully implemented
- **Features**:
  - Creates discussion rooms for sectors
  - Auto-assigns all sector agents (excluding managers)
  - Prevents duplicate open discussions
  - Auto-triggered by lifecycle loop

### 2. ✅ DISCUSS (Collect Arguments)
- **Function**: `collectArguments()`
- **Status**: ✅ **ENHANCED** - Now uses real agent reasoning
- **Features**:
  - **Research Agents**: Uses `ResearchAgent.produceResearchSignal()` for research/analyst agents
  - **Other Agents**: Generates signals based on:
    - Agent personality (risk tolerance, decision style)
    - Agent performance (win rate, P&L)
    - Sector data (price trends, volatility, risk score)
  - Creates realistic arguments with rationale
  - Adds messages to discussion
  - Updates status to `in_progress`

**Example Argument Generation:**
- High-risk, aggressive agents: More likely to BUY/SELL on trends
- Low-risk, conservative agents: More likely to HOLD or be cautious
- Agents with high win rates: Higher confidence in recommendations
- Sector price trends: Influences action (BUY on uptrend, SELL on downtrend)
- Volatility: Reduces confidence in high-volatility scenarios

### 3. ✅ DECIDE (Produce Decision)
- **Function**: `produceDecision()`
- **Status**: Fully implemented
- **Features**:
  - Collects arguments from all agents
  - Aggregates votes using voting system
  - Detects conflicts between agents
  - Resolves conflicts using win-rate clustering
  - Calculates final confidence
  - Selects best agent for the decision
  - Saves decision to discussion

### 4. ✅ CLOSE
- **Function**: `closeDiscussion()`
- **Status**: Fully implemented
- **Features**:
  - Produces decision if not already made
  - Sets status to `closed`
  - Updates timestamps

### 5. ✅ ARCHIVE
- **Function**: `archiveDiscussion()`
- **Status**: Fully implemented
- **Features**:
  - Ensures discussion is closed first
  - Sets status to `archived`
  - Auto-archives closed discussions after 1 minute

## Auto-Loop

The `autoDiscussionLoop()` runs every 15 seconds and automatically:
1. Creates new discussions for sectors with 2+ agents
2. Collects arguments for new discussions
3. Produces decisions for discussions with messages
4. Closes discussions after decisions
5. Archives closed discussions after 1 minute

## API Endpoints

### Standard Endpoints
- `POST /api/discussions` - Create discussion
- `GET /api/discussions` - List all discussions
- `GET /api/discussions/:id` - Get single discussion
- `POST /api/discussions/:id/message` - Add message
- `POST /api/discussions/:id/close` - Close discussion
- `POST /api/discussions/:id/archive` - Archive discussion
- `POST /api/discussions/:id/accept` - Accept discussion
- `POST /api/discussions/:id/reject` - Reject discussion

### ✅ NEW: Manual Lifecycle Triggers
- `POST /api/discussions/:id/collect-arguments` - Manually trigger argument collection
- `POST /api/discussions/:id/produce-decision` - Manually trigger decision production

## Error Handling

✅ **Improved Error Handling:**
- Individual discussion failures don't stop the auto-loop
- Detailed error logging for debugging
- Graceful fallbacks for agent signal generation
- Validation of discussion states before transitions

## Testing

### Verification Script
Run the verification script to test the complete lifecycle:

```bash
node scripts/verify-discussion-lifecycle.js
```

The script tests:
1. Creating a discussion
2. Collecting arguments
3. Producing a decision
4. Closing the discussion
5. Archiving the discussion
6. Verifying final state

### Manual Testing

**Test Create:**
```bash
curl -X POST http://localhost:8000/api/discussions \
  -H "Content-Type: application/json" \
  -d '{"sectorId": "sector-id", "title": "Test Discussion"}'
```

**Test Collect Arguments:**
```bash
curl -X POST http://localhost:8000/api/discussions/DISCUSSION-ID/collect-arguments
```

**Test Produce Decision:**
```bash
curl -X POST http://localhost:8000/api/discussions/DISCUSSION-ID/produce-decision
```

**Test Close:**
```bash
curl -X POST http://localhost:8000/api/discussions/DISCUSSION-ID/close
```

**Test Archive:**
```bash
curl -X POST http://localhost:8000/api/discussions/DISCUSSION-ID/archive
```

## Status Flow

```
created → in_progress → decided → closed → archived
                ↓
            accepted/rejected
```

## Key Improvements Made

1. ✅ **Real Agent Reasoning**: `collectArguments()` now uses actual agent logic instead of placeholders
2. ✅ **Sector Context**: Arguments consider sector price, trends, volatility, and risk
3. ✅ **Personality-Based Decisions**: Agent personality influences their recommendations
4. ✅ **Performance-Based Confidence**: Agent win rates affect confidence levels
5. ✅ **Research Agent Integration**: Research agents use their research methods
6. ✅ **Better Error Handling**: Individual failures don't break the loop
7. ✅ **Manual Triggers**: API endpoints for manual lifecycle stage execution
8. ✅ **Verification Script**: Automated testing of complete lifecycle

## Next Steps (Optional Enhancements)

- [ ] Add LLM-powered argument generation for agents
- [ ] Support multi-round discussions (agents can respond to each other)
- [ ] Add discussion timeouts (auto-close after X minutes)
- [ ] Add discussion priority levels
- [ ] Support discussion templates
- [ ] Add discussion analytics/metrics

## Files Modified

- `backend/agents/discussion/discussionLifecycle.js` - Enhanced with real reasoning
- `backend/routes/discussions.js` - Added manual trigger endpoints
- `scripts/verify-discussion-lifecycle.js` - New verification script

