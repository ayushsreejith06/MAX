# Phase 1 Foundations Verification Guide

This guide helps you verify that all Phase 1 foundations are working correctly.

## Quick Verification (Automated)

Run the automated verification script:

```bash
npm run verify:phase1
```

This will test:
- ✓ BaseAgent class functionality
- ✓ ManagerAgent extending BaseAgent
- ✓ Memory and reasoning system
- ✓ Sector storage system
- ✓ Cross-sector communication (MessageBus)
- ✓ Agent creation pipeline
- ✓ Runtime execution

## Manual Verification Steps

### 1. Verify BaseAgent Class

**Test in Node.js REPL:**
```bash
cd backend
node
```

```javascript
const BaseAgent = require('./agents/base/BaseAgent');

// Create a test agent
const agent = new BaseAgent({
  id: 'test-1',
  name: 'Test Agent',
  role: 'test',
  personality: { riskTolerance: 'high' }
});

// Test memory
agent.updateMemory({ type: 'observation', data: { test: 'data' } });
console.log('Memory length:', agent.memory.length); // Should be 1

// Test reasoning
agent.storeReasoning(Date.now(), 'Test reasoning', {});
const reasoning = agent.getReasoningHistory();
console.log('Reasoning history:', reasoning.length > 0); // Should be true

// Test state
agent.updateLastTick(Date.now());
const state = agent.getState();
console.log('State has lastTick:', state.lastTick !== null); // Should be true
```

### 2. Verify ManagerAgent

**Test ManagerAgent:**
```javascript
const ManagerAgent = require('./agents/manager/ManagerAgent');
const { loadSectors } = require('./utils/storage');

// Load a sector first
const sectors = await loadSectors();
const testSector = sectors[0]; // Use first sector

// Create manager
const manager = new ManagerAgent({
  id: 'test-manager-1',
  sectorId: testSector.id,
  name: 'Test Manager',
  personality: { riskTolerance: 'medium' }
});

// Test inheritance
console.log('Extends BaseAgent:', manager instanceof BaseAgent); // Should be true

// Test sector loading
const sector = await manager.loadSector();
console.log('Sector loaded:', sector !== null); // Should be true

// Test decision making
const decision = await manager.decide([]);
console.log('Decision made:', decision.action); // Should be 'HOLD'

// Test tick
const tickResult = await manager.tick();
console.log('Tick result:', tickResult !== null); // Should be true
```

### 3. Verify Sector Storage

**Test storage functions:**
```javascript
const { loadSectors, getSectorById, updateSector } = require('./utils/storage');

// Load sectors
const sectors = await loadSectors();
console.log('Sectors loaded:', sectors.length); // Should be > 0

// Get by ID
if (sectors.length > 0) {
  const sector = await getSectorById(sectors[0].id);
  console.log('Sector found:', sector !== null); // Should be true
  
  // Test update
  const updated = await updateSector(sectors[0].id, { testField: 'test' });
  console.log('Sector updated:', updated.testField === 'test'); // Should be true
}
```

### 4. Verify Message Bus

**Test cross-sector communication:**
```javascript
const { publish, drain, clearAll } = require('./agents/comms/MessageBus');

// Clear first
await clearAll();

// Publish a message
await publish({
  from: 'manager-1',
  to: 'manager-2',
  type: 'test',
  payload: { message: 'hello' }
});

// Drain messages
const messages = await drain('manager-2');
console.log('Messages received:', messages.length); // Should be 1
console.log('Message type:', messages[0].type); // Should be 'test'
```

### 5. Verify Agent Creation Pipeline

**Test via API or directly:**
```javascript
const { createAgent } = require('./agents/pipeline/createAgent');
const { loadAgents } = require('./utils/agentStorage');

// Create an agent
const agent = await createAgent('test trader agent buy sell', null);
console.log('Agent created:', agent.id); // Should have an ID
console.log('Agent role:', agent.role); // Should be 'trader'

// Verify saved
const agents = await loadAgents();
const found = agents.find(a => a.id === agent.id);
console.log('Agent saved:', found !== null); // Should be true
```

### 6. Verify Runtime

**Check if runtime is working:**
```javascript
const { getAgentRuntime } = require('./agents/runtime/agentRuntime');

const runtime = getAgentRuntime();
await runtime.initialize();

const status = runtime.getStatus();
console.log('Runtime status:', status);
console.log('Managers loaded:', status.managerCount); // Should show manager count
```

## Frontend Verification

### 1. Start the Backend
```bash
cd backend
npm run dev
```

### 2. Start the Frontend
```bash
cd frontend
npm run dev
```

### 3. Test in Browser

1. **Create a Sector:**
   - Navigate to sectors page
   - Create a new sector
   - Verify it appears in the list

2. **Create an Agent:**
   - Click "Create Agent" or navigate to agents page
   - Enter a prompt like "trader agent buy sell"
   - Select a sector (optional)
   - Verify agent is created and appears in the list

3. **Create a Manager Agent:**
   - Create an agent with prompt "manager agent coordinate oversee"
   - Assign to a sector
   - Verify it's created with role "manager"

4. **Check Runtime:**
   - Backend logs should show: `[AgentRuntime] Initialized X manager agents`
   - Backend logs should show: `[AgentRuntime] Starting tick loop`
   - Every 3 seconds, you should see manager tick logs

## Backend Log Verification

When the backend starts, you should see:

```
[AgentRuntime] Found X manager agents
[AgentRuntime] Loaded manager ... for sector ...
[AgentRuntime] Initialized X manager agents
[AgentRuntime] Starting tick loop with 3000ms interval
```

Every 3 seconds, you should see manager decisions being made (if there are agents in sectors).

## Common Issues & Solutions

### Issue: "ManagerAgent is not a constructor"
**Solution:** Make sure `backend/agents/manager/ManagerAgent.js` extends BaseAgent correctly.

### Issue: "Cannot find module './base/BaseAgent'"
**Solution:** Verify `backend/agents/base/BaseAgent.js` exists.

### Issue: "updateSector is not a function"
**Solution:** Make sure you've pulled the latest changes and `backend/utils/storage.js` has the `updateSector` function.

### Issue: Runtime not starting
**Solution:** 
- Check backend logs for errors
- Verify at least one manager agent exists with a valid sectorId
- Check that `backend/server.js` is calling `agentRuntime.initialize()` and `agentRuntime.start()`

## Expected File Structure

```
backend/
├── agents/
│   ├── base/
│   │   └── BaseAgent.js          ✓ Should exist
│   ├── manager/
│   │   └── ManagerAgent.js       ✓ Should extend BaseAgent
│   ├── comms/
│   │   └── MessageBus.js         ✓ Should exist
│   └── runtime/
│       └── agentRuntime.js       ✓ Should load ManagerAgent
├── utils/
│   └── storage.js                ✓ Should have updateSector()
└── server.js                     ✓ Should initialize runtime
```

## Success Criteria

All Phase 1 foundations are working if:

- [✓] BaseAgent class can be instantiated
- [✓] ManagerAgent extends BaseAgent
- [✓] ManagerAgent has state, memory, and reasoning
- [✓] ManagerAgent can load sectors
- [✓] ManagerAgent can make decisions
- [✓] ManagerAgent tick() works
- [✓] Cross-sector messages can be sent/received
- [✓] Sectors can be loaded, saved, and updated
- [✓] Agents can be created via pipeline
- [✓] Runtime initializes and starts
- [✓] Runtime calls manager.tick() periodically

If all automated tests pass, Phase 1 is complete! 🎉

