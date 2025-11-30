# Testing Agent Creation Pipeline

## Quick Test Steps (Tauri Desktop Mode)

### 1. Start the Desktop App

**From the project root:**
```bash
npm run tauri:dev
```

**What this does:**
- Starts the frontend dev server (Next.js)
- Launches the Tauri desktop app window
- **Automatically starts the backend server** in the background (via Tauri)

**Expected:**
- Desktop app window opens
- Backend server starts automatically (check the terminal output)
- You should see: `🚀 MAX Backend Server listening on...`
- Look for: `AgentRuntime initialized and started successfully`

**Note:** The backend runs in a separate thread managed by Tauri, so you'll see backend logs in the same terminal where you ran `npm run tauri:dev`.

### 2. Test Agent Creation from UI

**In the Tauri desktop app window:**

#### Option A: Create Agent from Agents Page
1. Click on "Agents" in the navigation (or navigate to the agents page)
2. Click "Spin New Agent" button
3. Fill in:
   - **Prompt**: `trade buy sell market` (creates a trader agent)
   - **Sector**: Select a sector or leave as "Unassigned"
4. Click "Spin Agent"
5. **Expected**: Modal closes, agent appears in the agents list

#### Option B: Create Agent from Sector Detail Page
1. Click on "Sectors" in the navigation
2. Click on any sector card
3. In the "SECTOR AGENTS" section, click "Create Agent"
4. Fill in prompt (sector is pre-selected)
5. Click "Spin Agent"
6. **Expected**: Agent appears in the sector's agent list

### 3. Verify Agent in Storage

Check the backend storage file:

```bash
# Windows PowerShell
cat backend\storage\agents.json

# Or open the file in your editor
# Path: backend/storage/agents.json
```

**Expected**: Your new agent should appear in the JSON array with:
- `id`: Unique ID
- `name`: Generated name (e.g., "TECH_TRADER1")
- `role`: Inferred role (e.g., "trader", "manager", "analyst")
- `sectorId`: The sector ID if assigned, or `null`
- `status`: "idle"
- `personality`: Object with riskTolerance and decisionStyle
- `performance`: `{ pnl: 0, winRate: 0 }`
- `trades`: `[]`

### 4. Verify Agent in API (Optional)

Test the GET endpoint:

```bash
# Get all agents
curl http://localhost:8000/api/agents

# Get specific agent (replace AGENT_ID with actual ID)
curl http://localhost:8000/api/agents/AGENT_ID
```

**Expected**: JSON response with your agent included

### 5. Verify Manager Agent in Runtime (if created manager)

If you created a manager agent (prompt like "manage coordinate oversee"), check backend logs:

**Look for in console:**
```
[AgentRuntime] Reloaded manager MANAGER_NAME (AGENT_ID) for sector SECTOR_ID
[AgentRuntime] Reloaded 1 new manager agents
```

**Or check runtime status:**
```bash
# In browser console or via API (if endpoint exists)
# The runtime should show the new manager in its managers map
```

### 6. Verify Sector Association

If agent was assigned to a sector:

```bash
# Get sector details
curl http://localhost:8000/api/sectors/SECTOR_ID
```

**Expected**: The `agents` array should include your new agent

### 7. Check Backend Logs

**In the terminal where you ran `npm run tauri:dev`, watch for:**

**On agent creation:**
```
POST /agents/create - Creating agent with prompt: ...
Agent created successfully - ID: ..., Role: ...
Manager agent ... reloaded into runtime (if manager)
Agent ... (UUID: ...) registered on-chain (if MAX_REGISTRY is set)
```

**During runtime ticks (for manager agents):**
```
[AgentRuntime] Starting tick loop with 3000ms interval
[AgentRuntime] Loaded manager ... for sector ...
```

## Common Issues & Solutions

### Issue: Agent not appearing in UI
- **Check**: Open DevTools in Tauri (should auto-open in dev mode, or press F12)
- **Check**: Console tab for errors
- **Check**: Network tab - is the POST request successful?
- **Check**: Terminal logs for backend errors
- **Solution**: Close and reopen the app, check if agent exists in storage

### Issue: Backend not starting
- **Check**: Terminal output when running `npm run tauri:dev`
- **Check**: Look for "Backend started successfully" message
- **Check**: Look for backend server listening message
- **Solution**: The backend should start automatically via Tauri. If not, check `src-tauri/src/main.rs` BackendProcess implementation

### Issue: "Failed to create agent" error
- **Check**: Terminal logs show backend is running
- **Check**: Prompt is not empty
- **Check**: Terminal logs for specific error message
- **Check**: DevTools console for network errors
- **Solution**: Backend should auto-start with Tauri. If errors persist, check backend logs in terminal

### Issue: Manager agent not in runtime
- **Check**: Backend logs for "reloadAgents" messages
- **Check**: Agent role is actually "manager" (check storage)
- **Check**: Agent has a sectorId (required for managers)
- **Solution**: Restart backend server if needed

### Issue: Agent not in sector's agent list
- **Check**: Agent's sectorId matches the sector
- **Check**: Sector API response includes agents array
- **Solution**: Agents are dynamically loaded - refresh the sector page

## Advanced Testing

### Test Request Validation

```bash
# Test empty prompt (should fail)
curl -X POST http://localhost:8000/api/agents/create \
  -H "Content-Type: application/json" \
  -d '{"prompt": "", "sectorId": null}'

# Expected: 400 error with "prompt is required and must be a non-empty string"

# Test invalid sectorId (should fail)
curl -X POST http://localhost:8000/api/agents/create \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test", "sectorId": 123}'

# Expected: 400 error with "sectorId must be a string or null"
```

### Test Different Agent Roles

Create agents with different prompts to test role inference:

- **Manager**: `"manage coordinate oversee supervise"`
- **Trader**: `"trade buy sell market execute"`
- **Analyst**: `"analyze research forecast predict"`
- **Research**: `"research investigate examine study"`
- **Advisor**: `"advise recommend suggest consult"`

### Test Runtime Execution (Manager Agents)

1. Create a manager agent for a sector
2. Wait a few seconds (runtime ticks every 3 seconds)
3. Check backend logs for decision outputs:
   ```
   [AgentRuntime] Error in tick for manager ... (if errors)
   [ManagerAgent ...] Decision: { action: 'HOLD', confidence: ... }
   ```

## Verification Checklist

After creating an agent, verify:

- [ ] Agent appears in `/agents` page
- [ ] Agent appears in sector detail page (if assigned)
- [ ] Agent exists in `backend/storage/agents.json`
- [ ] Agent can be fetched via GET `/api/agents/:id`
- [ ] Agent has correct role, personality, and sectorId
- [ ] If manager: Agent is loaded in runtime (check logs)
- [ ] If manager: Runtime tick loop is executing (check logs)
- [ ] No errors in DevTools console (F12 in Tauri app)
- [ ] No errors in terminal (where you ran `npm run tauri:dev`)

## Success Indicators

✅ **Everything is working if:**
- Agent creation succeeds without errors
- Agent appears in UI immediately (in Tauri desktop app)
- Agent persists in storage
- Manager agents are automatically loaded into runtime
- Terminal logs show successful creation and runtime loading
- No TypeErrors or missing import errors in DevTools console
- Backend server is running (check terminal output)

