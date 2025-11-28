# Manager Agent Verification Guide

This guide helps you verify that the Manager Agent system is working correctly.

## Quick Verification Checklist

- [ ] Server starts without errors
- [ ] AgentRuntime initializes and starts
- [ ] Manager agents are loaded
- [ ] Tick loop is running (decisions being made)
- [ ] Cross-sector communication works
- [ ] Decisions are logged

## Step-by-Step Verification

### 1. Start the Backend Server

```bash
cd backend
npm start
```

**Expected Console Output:**
```
🚀 MAX Backend Server listening on 127.0.0.1:4000
📍 Environment: desktop
📍 Health check: http://127.0.0.1:4000/health
...
[AgentRuntime] Found X manager agents
[AgentRuntime] Loaded manager <name> (<id>) for sector <sectorId>
[AgentRuntime] Initialized X manager agents
[AgentRuntime] Starting tick loop with 3000ms interval
AgentRuntime initialized and started successfully
```

**What to look for:**
- ✅ No errors about missing modules
- ✅ `AgentRuntime initialized and started successfully` message
- ✅ `[AgentRuntime] Found X manager agents` (X should be > 0 if you have manager agents)
- ✅ `[AgentRuntime] Starting tick loop` message

### 2. Check Runtime Status via API

**Endpoint:** `GET /api/manager/status`

```bash
# Using curl
curl http://localhost:4000/api/manager/status

# Or using PowerShell
Invoke-RestMethod -Uri "http://localhost:4000/api/manager/status" -Method Get
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "managerCount": 1,
    "tickIntervalMs": 3000,
    "decisionLogSize": 0,
    "managers": [
      {
        "id": "...",
        "sectorId": "...",
        "name": "...",
        "lastDecision": null,
        "decisionCount": 0
      }
    ]
  }
}
```

**What to verify:**
- ✅ `isRunning: true` - Runtime is active
- ✅ `managerCount > 0` - At least one manager is loaded
- ✅ `managers` array contains manager objects

### 3. Verify Manager Agents Exist

First, check if you have manager agents in your system:

```bash
# Get all agents
curl http://localhost:4000/api/agents

# Filter for managers (in PowerShell)
$agents = Invoke-RestMethod -Uri "http://localhost:4000/api/agents" -Method Get
$agents.data | Where-Object { $_.role -like "*manager*" }
```

**If no manager agents exist:**
1. Create a sector (this automatically creates a manager agent):
   ```bash
   curl -X POST http://localhost:4000/api/sectors \
     -H "Content-Type: application/json" \
     -d '{"sectorName":"Technology","sectorSymbol":"TECH"}'
   ```

2. Or create a manager agent manually:
   ```bash
   curl -X POST http://localhost:4000/api/agents \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Tech Manager",
       "role": "manager",
       "sectorId": "<your-sector-id>",
       "personality": {
         "riskTolerance": "medium",
         "decisionStyle": "balanced"
       }
     }'
   ```

### 4. Monitor Decision Making

Wait 3-5 seconds after server start, then check the status again:

```bash
curl http://localhost:4000/api/manager/status
```

**Expected Changes:**
- ✅ `decisionLogSize` should increase (if managers are making decisions)
- ✅ `lastDecision` should not be `null` after a few ticks
- ✅ `decisionCount` should increase

### 5. Check Decisions for a Specific Sector

**Endpoint:** `GET /api/manager/decisions/:sectorId`

```bash
# Replace <sectorId> with an actual sector ID
curl http://localhost:4000/api/manager/decisions/<sectorId>
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "managerId": "...",
      "sectorId": "...",
      "decision": {
        "action": "HOLD",
        "confidence": 0.5,
        "reason": "...",
        "timestamp": 1234567890
      },
      "timestamp": 1234567890
    }
  ]
}
```

### 6. Test Manual Decision Making

**Endpoint:** `POST /api/manager/decide`

```bash
curl -X POST http://localhost:4000/api/manager/decide \
  -H "Content-Type: application/json" \
  -d '{
    "sectorId": "<your-sector-id>",
    "signals": [
      {"action": "BUY", "confidence": 0.8, "agentId": "agent1"},
      {"action": "BUY", "confidence": 0.7, "agentId": "agent2"},
      {"action": "SELL", "confidence": 0.6, "agentId": "agent3"}
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "action": "BUY",
    "confidence": 0.75,
    "reason": "Majority vote: 2 agents voted BUY",
    "voteBreakdown": {
      "BUY": 2,
      "SELL": 1,
      "HOLD": 0
    },
    "conflictScore": 0.33
  }
}
```

### 7. Verify Cross-Sector Communication

Check if messages are being stored:

```bash
# Check if comms.json file exists
# Location: backend/storage/comms.json (or MAX_APP_DATA_DIR/comms.json in desktop mode)
```

**In PowerShell:**
```powershell
# Check if file exists
Test-Path "backend/storage/comms.json"

# View contents (if exists)
Get-Content "backend/storage/comms.json" | ConvertFrom-Json
```

**What to look for:**
- ✅ File exists (created when first message is sent)
- ✅ Contains message objects with `from`, `to`, `type`, `payload`, `timestamp`

### 8. Monitor Console Logs

Watch the server console for tick activity:

**Expected Logs (every 3 seconds):**
```
[AgentRuntime] Executing tick for all managers...
[ManagerAgent <id>] Making decision for sector <sectorId>
[ManagerAgent <id>] Decision: HOLD (confidence: 0.5)
```

**What to verify:**
- ✅ No error messages
- ✅ Regular tick activity (every 3 seconds)
- ✅ Decisions being logged

### 9. Verify Integration with Simulation Engine

The SimulationEngine should automatically use manager decisions when `simulateTick()` is called without explicit decisions.

**Test via API:**
```bash
# Trigger a simulation tick (if endpoint exists)
curl -X POST http://localhost:4000/api/sectors/<sectorId>/simulate
```

**Expected Behavior:**
- SimulationEngine calls `agentRuntime.getManagerBySector(sectorId)`
- Manager's `tick()` method is called
- Decision is used in simulation

## Troubleshooting

### Issue: "No manager agents found"

**Solution:**
1. Create a sector (automatically creates a manager)
2. Or manually create a manager agent with `role: "manager"`

### Issue: "AgentRuntime not initializing"

**Check:**
1. Verify `backend/agents/runtime/agentRuntime.js` exists
2. Check console for import errors
3. Verify `backend/agents/manager/ManagerAgent.js` exists

### Issue: "No decisions being made"

**Possible causes:**
1. No sector agents exist (managers need signals from sector agents)
2. Manager agents don't have a `sectorId`
3. Check console for errors in `tick()` method

**Solution:**
- Create some sector agents (non-manager agents) for the sector
- Verify manager has a valid `sectorId`

### Issue: "Cross-sector communication not working"

**Check:**
1. Verify `backend/agents/comms/MessageBus.js` exists
2. Check if `backend/storage/comms.json` is being created
3. Verify storage directory permissions

### Issue: "Server crashes on startup"

**Check console for:**
- Missing module errors
- Syntax errors
- Import path issues

**Common fixes:**
- Run `npm install` in backend directory
- Verify all file paths are correct
- Check Node.js version compatibility

## Automated Test Script

Create a test script to verify everything:

```javascript
// scripts/test-manager-agents.js
const http = require('http');

const BASE_URL = 'http://localhost:4000';

async function testManagerAgents() {
  console.log('Testing Manager Agent System...\n');

  // Test 1: Check status
  console.log('1. Checking runtime status...');
  const status = await fetch(`${BASE_URL}/api/manager/status`);
  const statusData = await status.json();
  console.log('   Status:', statusData.data.isRunning ? '✅ Running' : '❌ Not running');
  console.log('   Managers loaded:', statusData.data.managerCount);
  
  // Test 2: Wait for decisions
  console.log('\n2. Waiting 5 seconds for decisions...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Test 3: Check status again
  console.log('3. Checking decision log...');
  const status2 = await fetch(`${BASE_URL}/api/manager/status`);
  const statusData2 = await status2.json();
  console.log('   Decisions logged:', statusData2.data.decisionLogSize);
  
  if (statusData2.data.decisionLogSize > 0) {
    console.log('   ✅ Decisions are being made!');
  } else {
    console.log('   ⚠️  No decisions yet (may need sector agents)');
  }
  
  console.log('\n✅ Verification complete!');
}

testManagerAgents().catch(console.error);
```

Run it:
```bash
node scripts/test-manager-agents.js
```

## Success Criteria

Your Manager Agent system is working correctly if:

✅ Server starts without errors  
✅ AgentRuntime initializes and shows manager count > 0  
✅ Status endpoint returns `isRunning: true`  
✅ Decision log size increases over time  
✅ Console shows regular tick activity  
✅ No error messages in console  
✅ Managers can make decisions via `/api/manager/decide`  
✅ Cross-sector messages are stored in `comms.json`

## Next Steps

Once verified:
1. Monitor decision quality and confidence scores
2. Test cross-sector signal propagation
3. Integrate with frontend to display manager decisions
4. Add more sophisticated decision-making logic
5. Implement manager performance tracking

