# Quick Dev Start Guide

## Why `npm run tauri:dev` is Slow

The first time you run `tauri:dev`, it needs to:
1. **Compile Rust dependencies** (5-15 minutes first time) - This is the slow part!
2. Wait for frontend dev server at `http://localhost:3000`
3. Compile the Rust application itself

## Faster Development Approach

Instead of using `tauri:dev`, run everything separately for faster iteration:

### Option 1: Web Development (Fastest - Recommended)

**Terminal 1 - Backend:**
```powershell
cd backend
npm start
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

Then open `http://localhost:3000` in your browser. This is much faster for development!

### Option 2: Tauri Dev (After First Build)

Once Rust has compiled once, subsequent runs are faster:

**Terminal 1 - Backend:**
```powershell
cd backend
npm start
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

**Terminal 3 - Tauri (wait for frontend to be ready first):**
```powershell
npm run tauri:dev
```

## First-Time Rust Compilation

If you see Rust compiling dependencies, **this is normal** and will take 5-15 minutes. You'll see output like:
```
Compiling serde v1.0.x
Compiling tauri v1.5.x
...
```

**After the first build**, subsequent `tauri:dev` runs will be much faster (30 seconds - 2 minutes).

## Troubleshooting

### If it's stuck on "Compiling..."

- **First time?** This is normal - wait 10-15 minutes
- **Not first time?** Check if it's actually stuck or just slow
- **Want to speed it up?** Use Option 1 (web dev) instead

### If it says "Cannot connect to http://localhost:3000"

1. Make sure frontend is running: `cd frontend && npm run dev`
2. Wait for "Ready" message before starting Tauri
3. Check the port - might be 3001 or 3002 if 3000 is busy

### If you want to cancel and restart

Press `Ctrl+C` to stop. The Rust compilation progress is saved, so next time will be faster.

## Recommended Workflow

**For active development:**
- Use **Option 1** (web browser) - instant reload, no Rust compilation

**For testing desktop features:**
- Use **Option 2** (Tauri dev) - after first build is complete

**For production builds:**
- Use `npm run tauri:build:quick` (faster) or `npm run tauri:build` (full installer)

