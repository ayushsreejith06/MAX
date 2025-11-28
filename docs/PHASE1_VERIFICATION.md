# Phase 1 Verification Guide

This document outlines how to verify that all Phase 1 components are working correctly.

## Phase 1 Requirements

According to the roadmap, Phase 1 includes:
- ✅ Core infrastructure setup
- ✅ Basic agent framework
- ⚠️ Simple orderbook implementation (not yet implemented)
- ✅ Initial UI components

## Verification Checklist

### 1. Backend Infrastructure

#### 1.1 Server Setup
- [ ] Backend server starts without errors
- [ ] Health check endpoint responds
- [ ] Server listens on correct port (default: 3000, but should be 8000 per README)

**How to verify:**
```bash
cd backend
npm install  # if not already done
npm start    # or npm run dev
```

Then test the health endpoint:
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok"}
```

#### 1.2 API Routes
- [ ] Sectors routes are registered and accessible
- [ ] GET /sectors returns list of sectors
- [ ] POST /sectors creates a new sector

**How to verify:**
```bash
# Get all sectors
curl http://localhost:3000/sectors

# Create a new sector
curl -X POST http://localhost:3000/sectors \
  -H "Content-Type: application/json" \
  -d '{"name":"Finance"}'
```

### 2. Agent Framework

#### 2.1 Base Agent Class
- [ ] Agent class can be instantiated
- [ ] Agent has required properties (id, role, personality, sectorId)
- [ ] Agent can store and retrieve memories
- [ ] Agent can be serialized to JSON

**How to verify:**
```bash
cd backend
node -e "
const Agent = require('./agents/base/Agent.js');
const agent = new Agent(null, 'trader', { risk: 'high' }, 'sector-1');
agent.addMemory({ action: 'test', result: 'success' });
console.log(JSON.stringify(agent.toJSON(), null, 2));
"
```

#### 2.2 Agent Storage
- [ ] Agents can be saved to storage
- [ ] Agents can be loaded from storage
- [ ] Agent persistence works correctly

**How to verify:**
Check that `backend/storage/agents.json` exists and can be read/written.

### 3. Sector System

#### 3.1 Sector Model
- [ ] Sector class can be instantiated
- [ ] Sector has required properties (id, name, createdAt)
- [ ] Sector can be serialized to JSON

**How to verify:**
```bash
cd backend
node -e "
const Sector = require('./models/Sector.js');
const sector = new Sector('Technology');
console.log(JSON.stringify(sector.toJSON(), null, 2));
"
```

#### 3.2 Sector API
- [ ] GET /sectors returns existing sectors
- [ ] POST /sectors creates new sectors
- [ ] Sectors are persisted to storage

**How to verify:**
1. Start backend server
2. Use curl commands from section 1.2
3. Check `backend/storage/sectors.json` file is updated

### 4. Frontend Infrastructure

#### 4.1 Next.js Setup
- [ ] Frontend starts without errors
- [ ] Frontend is accessible in browser
- [ ] Navigation component renders correctly

**How to verify:**
```bash
cd frontend
npm install  # if not already done
npm run dev
```

Then open `http://localhost:3000` (or the port shown in terminal)

#### 4.2 UI Components
- [ ] Dashboard page loads
- [ ] Sectors page loads
- [ ] Agents page loads
- [ ] Navigation works between pages

**How to verify:**
1. Navigate to each page in the browser
2. Check that pages render without errors
3. Test navigation links

#### 4.3 API Integration
- [ ] Frontend can connect to backend API
- [ ] API client functions work correctly
- [ ] Error handling works

**How to verify:**
Check browser console for errors when navigating to sectors page.
Note: The frontend API is configured to use `http://localhost:3000` but backend might be on different port.

### 5. Orderbook (Phase 1 Requirement)

#### 5.1 Orderbook Implementation
- [ ] Orderbook class exists
- [ ] Can add buy orders
- [ ] Can add sell orders
- [ ] Can match orders
- [ ] Can retrieve orderbook state

**Status:** ⚠️ Not yet implemented - this is a Phase 1 requirement that needs to be completed.

## Common Issues and Solutions

### Issue: Backend routes not working
**Problem:** Server starts but routes return 404
**Solution:** Check that routes are registered in `server.js`. Currently routes exist but may not be connected.

### Issue: Frontend can't connect to backend
**Problem:** CORS errors or connection refused
**Solution:** 
1. Ensure backend is running
2. Check API_BASE_URL in `frontend/lib/api.ts` matches backend port
3. Add CORS middleware to backend if needed

### Issue: Port conflicts
**Problem:** Frontend and backend both trying to use port 3000
**Solution:** 
- Backend should use port 8000 (set PORT=8000 or update server.js)
- Update frontend API_BASE_URL to point to port 8000

## Quick Verification Script

Run this script to quickly check Phase 1 status:

```bash
# Check backend
cd backend
echo "Checking backend..."
node -e "const Agent = require('./agents/base/Agent.js'); console.log('✓ Agent class loaded');"
node -e "const Sector = require('./models/Sector.js'); console.log('✓ Sector class loaded');"
echo "Backend checks complete"

# Check frontend
cd ../frontend
echo "Checking frontend..."
npm run build --dry-run 2>&1 | head -5 || echo "Frontend structure OK"
echo "Frontend checks complete"
```

## Next Steps

After verifying Phase 1:
1. Fix any issues found
2. Implement missing orderbook functionality
3. Connect frontend to backend properly
4. Add integration tests
5. Document any deviations from requirements



