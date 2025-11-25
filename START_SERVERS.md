# How to Start MAX Servers

## Quick Start

I've set up both servers for you. Here's how to see them working:

## Method 1: Use the New Windows (Recommended)

Two PowerShell windows should have opened:
1. **Backend window** - Running on port 8000
2. **Frontend window** - Running on port 3000

If they didn't open, use Method 2 below.

## Method 2: Manual Start

### Terminal 1 - Backend
```bash
cd backend
npm start
```

You should see:
```
🚀 MAX Backend Server listening on port 8000
📍 Health check: http://localhost:8000/health
📍 Sectors API: http://localhost:8000/sectors
```

### Terminal 2 - Frontend
```bash
cd frontend
npm run dev
```

You should see:
```
  ▲ Next.js 15.x.x
  - Local:        http://localhost:3000
```

## Testing Everything

### 1. Test Backend Individually

Open a new terminal and run:
```bash
# Health check
curl http://localhost:8000/health

# Get sectors
curl http://localhost:8000/sectors

# Create a sector
curl -X POST http://localhost:8000/sectors -H "Content-Type: application/json" -d "{\"name\":\"Healthcare\"}"
```

Or use the test script:
```bash
node scripts/test-servers.js
```

### 2. Test Frontend Individually

Open your browser:
- **Dashboard**: http://localhost:3000
- **Sectors**: http://localhost:3000/sectors
- **Agents**: http://localhost:3000/agents

### 3. Test Frontend + Backend Together

1. Open http://localhost:3000/sectors
2. You should see:
   - A form to create sectors
   - Existing sectors listed (e.g., "Technology")
3. Create a new sector:
   - Type a name (e.g., "Finance")
   - Click "Create Sector"
   - It should appear in the list immediately
4. Open DevTools (F12) → Network tab to see API calls

## What's Working Now

✅ **Backend API** (Port 8000)
- Health endpoint: `/health`
- Get sectors: `GET /sectors`
- Create sector: `POST /sectors`

✅ **Frontend UI** (Port 3000)
- Dashboard page
- Sectors page (with full CRUD functionality)
- Agents page
- Navigation between pages

✅ **Integration**
- Frontend can fetch sectors from backend
- Frontend can create sectors via backend API
- Real-time UI updates
- CORS configured

## Verify Everything

Run this command to test both servers:
```bash
node scripts/test-servers.js
```

Expected output:
- ✅ Backend health check passed
- ✅ GET /sectors passed
- ✅ POST /sectors passed
- ✅ Frontend server running

## Troubleshooting

**Backend not starting?**
- Make sure you're in the `backend` directory
- Check if port 8000 is already in use
- Run `npm install` if dependencies are missing

**Frontend not starting?**
- Make sure you're in the `frontend` directory
- Check if port 3000 is already in use (Next.js will use 3001, 3002, etc.)
- Run `npm install` if dependencies are missing

**Frontend can't connect to backend?**
- Verify backend is running on port 8000
- Check browser console (F12) for errors
- Verify `frontend/lib/api.ts` has correct API URL

## Next Steps

1. ✅ Servers are running
2. ✅ Test the Sectors page in browser
3. ✅ Create some sectors
4. ⚠️ Implement orderbook (Phase 1 requirement)
5. ⚠️ Add more frontend features

Enjoy! 🚀

