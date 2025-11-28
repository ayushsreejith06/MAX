# Frontend Verification Guide - Manager Agents

## Quick Start

### 1. Start the Backend Server

```powershell
cd backend
npm start
```

**Wait for:** `🚀 MAX Backend Server listening on...` and `AgentRuntime initialized and started successfully`

### 2. Start the Frontend

```powershell
cd frontend
npm run dev
```

**Wait for:** `Ready` message and the URL (usually `http://localhost:3000`)

### 3. Open in Browser

Open `http://localhost:3000` (or the port shown in the terminal)

## Where to See Manager Agent Data

### Step 1: Navigate to Sectors Page

1. Click on **"Sectors"** in the navigation menu (or go to `http://localhost:3000/sectors`)
2. You should see a list of sectors

### Step 2: Open a Sector Detail Page

1. Click on any sector (e.g., "Technology" or "TECH")
2. This will take you to `/sectors/[sector-id]`

### Step 3: Scroll to Manager Agent Section

Scroll down on the sector detail page until you see:

```
┌─────────────────────────────────────┐
│ MANAGER AGENT              [●]      │
│ Active • 1 manager(s) running       │
├─────────────────────────────────────┤
│ [Manager details and decisions]     │
└─────────────────────────────────────┘
```

## What You Should See

### ✅ If Working Correctly:

1. **Manager Status**
   - Green text: "Active • 1 manager(s) running"
   - Manager name (e.g., "TECH_manager")
   - Manager ID (shortened)
   - Decision count

2. **Latest Decision Card**
   - Action badge (BUY/SELL/HOLD) with color:
     - 🟢 BUY = Green
     - 🔴 SELL = Red
     - ⚪ HOLD = Gray
   - Decision reason/explanation
   - Confidence percentage
   - Conflict score (if applicable)
   - Timestamp

3. **Vote Breakdown** (if available)
   - BUY: X votes
   - SELL: X votes
   - HOLD: X votes

4. **Recent Decisions List**
   - Last 5 decisions
   - Each showing: Action, Confidence %, Time
   - Updates automatically every 5 seconds

### ⚠️ If Not Working:

**"No manager agent found for this sector"**
- Solution: The sector doesn't have a manager agent yet
- Fix: Create a new sector (this automatically creates a manager)

**"Loading..." (stuck)**
- Check browser console (F12) for errors
- Verify backend is running and accessible
- Check network tab for failed API calls

**Empty decisions list**
- This is normal if the manager just started
- Wait 10-15 seconds for decisions to appear
- Decisions are made every 3 seconds

## Quick Verification Checklist

- [ ] Backend server is running
- [ ] Frontend dev server is running
- [ ] Can access `http://localhost:3000`
- [ ] Can navigate to sectors page
- [ ] Can open a sector detail page
- [ ] Manager Agent section is visible
- [ ] Shows "Active" status
- [ ] Shows manager name
- [ ] Shows latest decision (or "No decisions yet")
- [ ] Updates automatically (watch for new decisions)

## Testing the Auto-Refresh

1. Open the sector detail page
2. Open browser DevTools (F12) → Network tab
3. Watch for API calls to `/api/manager/status` and `/api/manager/decisions/[sectorId]`
4. These should happen every 5 seconds
5. New decisions should appear in the "Recent Decisions" list

## Troubleshooting

### Can't see Manager Agent section?

1. **Check the sector has a manager:**
   ```powershell
   # In browser console (F12), run:
   fetch('http://localhost:3001/api/manager/status')
     .then(r => r.json())
     .then(console.log)
   ```
   Should show `managerCount > 0`

2. **Check the sector ID matches:**
   - The manager's `sectorId` must match the sector you're viewing
   - Check the URL: `/sectors/[sector-id]`

### API Errors in Console?

1. **CORS errors:**
   - Backend should allow CORS (already configured)
   - Check backend is running

2. **404 errors:**
   - Verify backend port (check console output)
   - Update `frontend/lib/desktopEnv.ts` if needed

3. **Connection refused:**
   - Backend not running
   - Wrong port number
   - Firewall blocking connection

### No Decisions Showing?

1. **Check backend logs:**
   - Should see `[AgentRuntime] Executing tick for all managers...`
   - Should see decisions being logged

2. **Check manager is making decisions:**
   ```powershell
   # Test the API directly:
   Invoke-RestMethod -Uri "http://localhost:3001/api/manager/status" | ConvertTo-Json
   ```
   Look for `decisionLogSize > 0`

3. **Wait a bit:**
   - Managers make decisions every 3 seconds
   - Frontend refreshes every 5 seconds
   - May take 10-15 seconds to see first decisions

## Expected Behavior

- ✅ Manager Agent section appears on sector detail page
- ✅ Shows manager status and info
- ✅ Displays latest decision with details
- ✅ Shows recent decisions list
- ✅ Auto-refreshes every 5 seconds
- ✅ New decisions appear automatically
- ✅ No console errors
- ✅ API calls succeed (check Network tab)

## Quick Test

1. Open sector detail page
2. Open browser DevTools (F12)
3. Go to Console tab
4. You should see no errors
5. Go to Network tab
6. Filter by "manager"
7. You should see requests to `/api/manager/status` and `/api/manager/decisions/...`
8. Check the responses - they should have data

If all of the above works, your Manager Agent frontend integration is working! 🎉

