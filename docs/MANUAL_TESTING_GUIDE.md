# Manual Testing Guide for Phase 1

This guide provides step-by-step instructions for manually testing Phase 1 components.

## Prerequisites

1. Node.js v18+ installed
2. npm or pnpm installed
3. Terminal/Command Prompt access

## Step 1: Install Dependencies

### Backend
```bash
cd backend
npm install
```

### Frontend
```bash
cd frontend
npm install
```

## Step 2: Start Backend Server

```bash
cd backend
npm run dev
```

**Expected Output:**
- Server should start without errors
- Should see: "Server listening on port 3000" (or configured port)
- Note: Backend currently uses port 3000, but should be 8000 per README

**Verify:**
Open a new terminal and test the health endpoint:
```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{"status":"ok"}
```

## Step 3: Test Backend API

### Test GET /sectors
```bash
curl http://localhost:3000/sectors
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "name": "Technology",
      "createdAt": "..."
    }
  ]
}
```

### Test POST /sectors
```bash
curl -X POST http://localhost:3000/sectors \
  -H "Content-Type: application/json" \
  -d '{"name":"Finance"}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "Finance",
    "createdAt": "..."
  }
}
```

**Note:** If you get a 404 error, the routes may not be properly connected to the server. Check `backend/server.js` to ensure routes are registered.

## Step 4: Test Agent Framework

Open a Node.js REPL:
```bash
cd backend
node
```

Then run:
```javascript
const Agent = require('./agents/base/Agent.js');

// Create an agent
const agent = new Agent(null, 'trader', { risk: 'high' }, 'sector-1');

// Add memory
agent.addMemory({ action: 'test', result: 'success' });

// Check agent properties
console.log('Agent ID:', agent.id);
console.log('Agent Role:', agent.role);
console.log('Agent Sector:', agent.sectorId);
console.log('Memories:', agent.memory.length);

// Serialize to JSON
console.log(JSON.stringify(agent.toJSON(), null, 2));

// Get summary
console.log(agent.getSummary());
```

**Expected:** Should see agent data with ID, role, memories, etc.

## Step 5: Test Sector Model

In the same Node.js REPL:
```javascript
const Sector = require('./models/Sector.js');

// Create a sector
const sector = new Sector('Healthcare');

// Check properties
console.log('Sector ID:', sector.id);
console.log('Sector Name:', sector.name);
console.log('Created At:', sector.createdAt);

// Serialize to JSON
console.log(JSON.stringify(sector.toJSON(), null, 2));
```

**Expected:** Should see sector data with ID, name, and timestamp.

## Step 6: Start Frontend

In a new terminal:
```bash
cd frontend
npm run dev
```

**Expected Output:**
- Next.js dev server should start
- Should see: "Ready on http://localhost:3000" (or next available port)
- Note: If backend is on 3000, frontend will use 3001

## Step 7: Test Frontend UI

1. Open browser to `http://localhost:3000` (or the port shown)

2. **Test Navigation:**
   - Click "Dashboard" - should show empty state
   - Click "Sectors" - should show sectors page
   - Click "Agents" - should show agents page
   - Navigation should highlight active page

3. **Check Browser Console:**
   - Open Developer Tools (F12)
   - Check Console tab for errors
   - Check Network tab for API calls

4. **Test API Connection:**
   - Navigate to Sectors page
   - Check Network tab for request to `/sectors`
   - If you see CORS errors, backend needs CORS middleware
   - If you see connection refused, check API_BASE_URL in `frontend/lib/api.ts`

## Step 8: Verify Storage

### Check Sector Storage
```bash
cat backend/storage/sectors.json
```

**Expected:** Should see JSON array with sectors.

### Check Agent Storage
```bash
cat backend/storage/agents.json
```

**Expected:** Should see JSON array (may be empty if no agents created yet).

## Common Issues

### Issue: Backend routes return 404
**Problem:** Routes exist but aren't registered in server.js
**Solution:** Check `backend/server.js` - routes need to be registered. Currently using Fastify but routes are Express format.

### Issue: Frontend can't connect to backend
**Problem:** CORS or port mismatch
**Solution:**
1. Check `frontend/lib/api.ts` - API_BASE_URL should match backend port
2. Add CORS to backend if needed
3. Ensure backend is running

### Issue: Port conflicts
**Problem:** Frontend and backend both on port 3000
**Solution:**
- Set backend PORT=8000 in environment or update server.js
- Update frontend API_BASE_URL to http://localhost:8000

## Phase 1 Status Checklist

- [ ] Backend server starts successfully
- [ ] Health endpoint responds
- [ ] GET /sectors works
- [ ] POST /sectors works
- [ ] Agent class can be instantiated
- [ ] Sector class can be instantiated
- [ ] Frontend starts successfully
- [ ] All pages load without errors
- [ ] Navigation works
- [ ] Storage files exist and are writable
- [ ] Orderbook implementation exists (⚠️ Currently missing)

## Next Steps

1. Fix any issues found during testing
2. Implement missing orderbook functionality
3. Connect frontend to backend properly
4. Add error handling and validation
5. Write integration tests

