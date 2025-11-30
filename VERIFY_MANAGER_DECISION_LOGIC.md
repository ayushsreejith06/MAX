# Verification Guide: Manager Decision Logic

This guide helps you verify that the ManagerAgent has:
- ✅ Voting logic across agents
- ✅ Confidence aggregation
- ✅ Conflict resolution
- ✅ Final manager decision emitted and persisted

---

## Prerequisites

1. **Backend server must be running:**
   ```powershell
   cd backend
   npm start
   ```

2. **Verify server is accessible:**
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:4000/health" -Method Get
   ```

---

## Step 1: Create Test Setup

### 1.1 Create a Sector (if you don't have one)

```powershell
$body = @{
    sectorName = "Technology"
    sectorSymbol = "TECH"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/sectors" -Method Post -ContentType "application/json" -Body $body
```

**Note:** This automatically creates a manager agent for the sector.

### 1.2 Create 3 Agents in the Sector

Get your sector ID first:
```powershell
$sectors = Invoke-RestMethod -Uri "http://localhost:4000/api/sectors" -Method Get
$sectorId = $sectors.data.data[0].id
Write-Host "Using sector: $sectorId"
```

Create 3 agents with different roles:

**Agent 1 - Trader:**
```powershell
$body = @{
    sectorId = $sectorId
    prompt = "trade buy sell market execute"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/agents" -Method Post -ContentType "application/json" -Body $body
```

**Agent 2 - Analyst:**
```powershell
$body = @{
    sectorId = $sectorId
    prompt = "analyze research forecast predict"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/agents" -Method Post -ContentType "application/json" -Body $body
```

**Agent 3 - Trader:**
```powershell
$body = @{
    sectorId = $sectorId
    prompt = "trading position entry exit"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4000/api/agents" -Method Post -ContentType "application/json" -Body $body
```

### 1.3 Restart Server (Important!)

The server needs to restart to pick up the new agents:
1. Stop the server (Ctrl+C)
2. Restart: `npm start`

---

## Step 2: Test Signal Collection & Decision Making

### 2.1 Manual Decision Test (With Explicit Signals)

Test the decision endpoint with explicit signals to verify voting:

```powershell
$sectorId = "your-sector-id-here"  # Replace with your sector ID

$body = @{
    sectorId = $sectorId
    signals = @(
        @{ action = "BUY"; confidence = 0.8; agentId = "agent-1" },
        @{ action = "BUY"; confidence = 0.7; agentId = "agent-2" },
        @{ action = "SELL"; confidence = 0.6; agentId = "agent-3" }
    )
} | ConvertTo-Json -Depth 10

$result = Invoke-RestMethod -Uri "http://localhost:4000/api/manager/decide" -Method Post -ContentType "application/json" -Body $body
$result | ConvertTo-Json -Depth 10
```

**Expected Output:**
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
    "conflictScore": 0.67,
    "timestamp": 1234567890
  }
}
```

**What to Verify:**
- ✅ `action` is "BUY" (majority vote)
- ✅ `voteBreakdown` shows 2 BUY, 1 SELL
- ✅ `conflictScore` is calculated (should be > 0 since there's disagreement)
- ✅ `confidence` is aggregated from signals

### 2.2 Test Conflict Resolution

Test with conflicting signals (tie scenario):

```powershell
$body = @{
    sectorId = $sectorId
    signals = @(
        @{ action = "BUY"; confidence = 0.9; agentId = "agent-1" },
        @{ action = "SELL"; confidence = 0.8; agentId = "agent-2" },
        @{ action = "HOLD"; confidence = 0.7; agentId = "agent-3" }
    )
} | ConvertTo-Json -Depth 10

$result = Invoke-RestMethod -Uri "http://localhost:4000/api/manager/decide" -Method Post -ContentType "application/json" -Body $body
$result | ConvertTo-Json -Depth 10
```

**Expected Output:**
- ✅ `conflictScore` should be high (> 0.5)
- ✅ `action` should be resolved (BUY, SELL, or HOLD based on highest confidence sum)
- ✅ `reason` should mention conflict resolution

---

## Step 3: Verify Automatic Decision Making

### 3.1 Check Runtime Status

```powershell
$status = Invoke-RestMethod -Uri "http://localhost:4000/api/manager/status" -Method Get
$status | ConvertTo-Json -Depth 10
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

### 3.2 Wait for Automatic Decisions

Managers tick every 3 seconds. Wait 10 seconds, then check again:

```powershell
Start-Sleep -Seconds 10
$status = Invoke-RestMethod -Uri "http://localhost:4000/api/manager/status" -Method Get
$status.data.data.managers | ConvertTo-Json -Depth 10
```

**What to Verify:**
- ✅ `decisionCount` should increase
- ✅ `lastDecision` should have a decision object
- ✅ `decisionLogSize` should increase

### 3.3 Check Manager's Last Decision

```powershell
$status = Invoke-RestMethod -Uri "http://localhost:4000/api/manager/status" -Method Get
$manager = $status.data.data.managers[0]
$manager.lastDecision | ConvertTo-Json -Depth 10
```

**Expected Output:**
```json
{
  "action": "BUY",
  "confidence": 0.65,
  "reason": "Majority vote: 2 agents voted BUY",
  "voteBreakdown": {
    "BUY": 2,
    "SELL": 0,
    "HOLD": 1
  },
  "conflictScore": 0.45,
  "timestamp": 1234567890
}
```

---

## Step 4: Verify Decision Persistence

### 4.1 Check Agent Memory

Get the manager agent and check its memory:

```powershell
$agents = Invoke-RestMethod -Uri "http://localhost:4000/api/agents" -Method Get
$manager = $agents.data.data | Where-Object { $_.role -eq "manager" -and $_.sectorId -eq $sectorId }
$manager | ConvertTo-Json -Depth 10
```

**What to Verify:**
- ✅ `memory` array should contain decision entries
- ✅ `lastDecision` field should be populated
- ✅ `lastDecisionAt` timestamp should be recent

### 4.2 Check Sector Logs (if implemented)

```powershell
$sector = Invoke-RestMethod -Uri "http://localhost:4000/api/sectors/$sectorId" -Method Get
$sector.data.data | ConvertTo-Json -Depth 10
```

**What to Verify:**
- ✅ `decisionLogs` array should contain recent decisions
- ✅ `lastDecision` field should be updated

---

## Step 5: Verify Console Logs

Check the backend server console for these log messages:

**Expected Logs:**
```
[AgentRuntime] Executing tick for all managers...
[ManagerAgent <id>] Decision: BUY (confidence: 0.65)
[ManagerAgent <id>] Good decision! Morale +3 (1 consecutive wins)
```

**What to Verify:**
- ✅ Manager is making decisions every 3 seconds
- ✅ Decisions show action and confidence
- ✅ Morale updates (if price changes)

---

## Step 6: Run Automated Test Script

Use the existing test script:

```powershell
node scripts/test-manager-agents.js
```

This will:
- ✅ Check server is running
- ✅ Check runtime status
- ✅ Test manual decision endpoint
- ✅ Verify managers are making decisions

---

## Verification Checklist

### Core Functionality
- [ ] **Signal Collection**: Manager collects signals from 3 agents
- [ ] **Voting**: Majority vote works (2 BUY, 1 SELL → BUY)
- [ ] **Confidence Aggregation**: Confidence is calculated from signals
- [ ] **Conflict Resolution**: Conflicts are detected and resolved
- [ ] **Decision Output**: Final decision has action, confidence, reason

### Persistence
- [ ] **Agent Memory**: Decisions stored in manager's memory
- [ ] **Decision History**: `decisionHistory` array is populated
- [ ] **Last Decision**: `lastDecision` field is updated

### Runtime
- [ ] **Automatic Ticking**: Manager ticks every 3 seconds
- [ ] **Decision Logging**: Decisions appear in runtime logs
- [ ] **Status Endpoint**: `/api/manager/status` shows active managers

---

## Troubleshooting

### No Decisions Being Made

**Problem:** `decisionCount` stays at 0

**Solutions:**
1. Verify agents exist in the sector:
   ```powershell
   $agents = Invoke-RestMethod -Uri "http://localhost:4000/api/agents" -Method Get
   $sectorAgents = $agents.data.data | Where-Object { $_.sectorId -eq $sectorId }
   Write-Host "Agents in sector: $($sectorAgents.Count)"
   ```

2. Restart the server after creating agents

3. Check console for errors

### All Decisions are HOLD

**Problem:** Manager always returns HOLD

**Solutions:**
1. Verify agents are producing signals (check console logs)
2. Agents might need performance data to generate signals
3. Try manual decision test with explicit signals

### Conflict Resolution Not Working

**Problem:** High conflict scores but no resolution

**Solutions:**
1. Check `conflictThreshold` in runtime config (default: 0.5)
2. Verify `resolveConflict()` is being called
3. Check console logs for conflict resolution messages

---

## Quick Verification Command

Run this PowerShell script to verify everything at once:

```powershell
# Quick Verification Script
$sectorId = "your-sector-id-here"  # Replace with your sector ID

Write-Host "=== Manager Decision Logic Verification ===" -ForegroundColor Cyan

# Test 1: Manual Decision
Write-Host "`n1. Testing manual decision..." -ForegroundColor Yellow
$body = @{
    sectorId = $sectorId
    signals = @(
        @{ action = "BUY"; confidence = 0.8; agentId = "test-1" },
        @{ action = "BUY"; confidence = 0.7; agentId = "test-2" },
        @{ action = "SELL"; confidence = 0.6; agentId = "test-3" }
    )
} | ConvertTo-Json -Depth 10

$result = Invoke-RestMethod -Uri "http://localhost:4000/api/manager/decide" -Method Post -ContentType "application/json" -Body $body
if ($result.success -and $result.data.action -eq "BUY") {
    Write-Host "   ✅ Voting works: BUY decision made" -ForegroundColor Green
    Write-Host "   📊 Confidence: $($result.data.confidence)" -ForegroundColor Gray
    Write-Host "   📊 Vote Breakdown: BUY=$($result.data.voteBreakdown.BUY), SELL=$($result.data.voteBreakdown.SELL)" -ForegroundColor Gray
} else {
    Write-Host "   ❌ Voting failed" -ForegroundColor Red
}

# Test 2: Runtime Status
Write-Host "`n2. Checking runtime status..." -ForegroundColor Yellow
$status = Invoke-RestMethod -Uri "http://localhost:4000/api/manager/status" -Method Get
if ($status.data.data.isRunning) {
    Write-Host "   ✅ Runtime is running" -ForegroundColor Green
    Write-Host "   📊 Managers: $($status.data.data.managerCount)" -ForegroundColor Gray
    Write-Host "   📊 Decisions: $($status.data.data.decisionLogSize)" -ForegroundColor Gray
} else {
    Write-Host "   ❌ Runtime not running" -ForegroundColor Red
}

Write-Host "`n=== Verification Complete ===" -ForegroundColor Cyan
```

---

## Success Criteria

✅ **All checks pass if:**
1. Manual decision test returns correct action based on majority vote
2. Vote breakdown shows correct counts
3. Confidence is aggregated (0-1 range)
4. Conflict score is calculated when signals disagree
5. Runtime shows managers making decisions automatically
6. Agent memory contains decision entries
7. Console logs show decision-making activity

If all of the above pass, the Manager Decision Logic is working correctly! 🎉

