# Quick Verification Guide - Manager Agents

## ⚠️ IMPORTANT: Restart the Server First!

The new routes (`/api/manager/status` and `/api/manager/decisions/:sectorId`) require a server restart to be loaded.

## Steps to Verify

### 1. Restart the Backend Server

Stop the current server (Ctrl+C) and restart it:

```powershell
cd backend
npm start
```

**Look for these messages in the console:**
```
[AgentRuntime] Found X manager agents
[AgentRuntime] Initialized X manager agents
[AgentRuntime] Starting tick loop with 3000ms interval
AgentRuntime initialized and started successfully
```

### 2. Run the Test Script

```powershell
node scripts/test-manager-agents.js
```

### 3. Manual Verification

**Check Runtime Status:**
```powershell
Invoke-RestMethod -Uri "http://localhost:4000/api/manager/status" -Method Get | ConvertTo-Json -Depth 10
```

**Expected Output:**
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "managerCount": 1,
    "tickIntervalMs": 3000,
    "decisionLogSize": 0,
    "managers": [...]
  }
}
```

**Check Decisions for a Sector:**
```powershell
# Replace <sectorId> with your actual sector ID
$sectorId = "your-sector-id-here"
Invoke-RestMethod -Uri "http://localhost:4000/api/manager/decisions/$sectorId" -Method Get | ConvertTo-Json -Depth 10
```

### 4. If No Managers Found

Create a sector (this automatically creates a manager agent):

```powershell
$body = @{
    sectorName = "Technology"
    sectorSymbol = "TECH"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/sectors" -Method Post -ContentType "application/json" -Body $body
```

Then **restart the server** again so it picks up the new manager agent.

## Troubleshooting

### Route Not Found (404)
- **Solution:** Restart the server - the new routes need to be loaded

### No Managers Found
- **Solution:** Create a sector first, then restart the server

### AgentRuntime Not Initializing
- Check console for errors
- Verify `backend/agents/runtime/agentRuntime.js` exists
- Verify `backend/agents/manager/ManagerAgent.js` exists

