# Running MAX Servers - Quick Guide

## Current Status

✅ **Backend Server**: Running on port 8000
✅ **Frontend Server**: Starting on port 3000 (or next available)

## How to See Everything Working

### Option 1: Automated Test (Recommended)

Run the test script to verify both servers:
```bash
node scripts/test-servers.js
```

### Option 2: Manual Testing

#### 1. Test Backend Individually

**Health Check:**
```bash
curl http://localhost:8000/health
```
Expected: `{"status":"ok"}`

**Get All Sectors:**
```bash
curl http://localhost:8000/sectors
```
Expected: JSON array of sectors

**Create a Sector:**
```bash
curl -X POST http://localhost:8000/sectors -H "Content-Type: application/json" -d "{\"name\":\"Finance\"}"
```
Expected: JSON object with the new sector

#### 2. Test Frontend Individually

Open your browser and navigate to:
- **Dashboard**: http://localhost:3000
- **Sectors Page**: http://localhost:3000/sectors
- **Agents Page**: http://localhost:3000/agents

#### 3. Test Frontend + Backend Together

1. Open http://localhost:3000/sectors in your browser
2. You should see the existing "Technology" sector
3. Enter a new sector name (e.g., "Healthcare") in the form
4. Click "Create Sector"
5. The new sector should appear in the list below
6. Open browser DevTools (F12) → Network tab to see API calls

## What You Should See

### Backend (Terminal)
```
🚀 MAX Backend Server listening on port 8000
📍 Health check: http://localhost:8000/health
📍 Sectors API: http://localhost:8000/sectors
```

### Frontend (Browser)
- **Sectors Page** should show:
  - A form to create new sectors
  - A list of existing sectors
  - Real-time updates when you create a sector

### Browser Console (F12)
- No CORS errors
- Successful API calls to `http://localhost:8000/sectors`
- Network requests showing 200 status codes

## Troubleshooting

### Backend not responding?
1. Check if it's running: Look for the server startup message
2. Check port: Should be 8000 (not 3000)
3. Restart: `cd backend && npm start`

### Frontend can't connect to backend?
1. Check API URL: Should be `http://localhost:8000` (see `frontend/lib/api.ts`)
2. Check CORS: Backend has CORS enabled
3. Check browser console for errors

### Port conflicts?
- Backend uses port 8000
- Frontend uses port 3000 (or next available)
- If 3000 is taken, Next.js will use 3001, 3002, etc.

## Quick Commands

**Start Backend:**
```bash
cd backend
npm start
```

**Start Frontend:**
```bash
cd frontend
npm run dev
```

**Test Everything:**
```bash
node scripts/test-servers.js
```

## What's Working

✅ Backend API endpoints (health, sectors)
✅ Frontend pages (Dashboard, Sectors, Agents)
✅ Frontend-Backend communication
✅ Sector creation and listing
✅ Real-time UI updates

Enjoy testing! 🚀

