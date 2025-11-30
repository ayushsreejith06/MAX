# MAX Desktop Application Build Guide

This document describes how to build and distribute the MAX desktop application for Windows.

## Prerequisites

1. **Node.js** (v18 or higher) - Required for building the frontend and backend
2. **Rust** (latest stable) - Required for building the Tauri application
3. **Windows SDK** - Required for Windows builds
4. **Visual Studio Build Tools** (for Windows) - Required for compiling Rust on Windows

## Installation

1. Install Rust from https://rustup.rs/
2. Install Node.js from https://nodejs.org/
3. Install all dependencies:
   ```bash
   npm run install:all
   npm install
   ```

## Development

### Running in Development Mode

1. Start the backend server:
   ```bash
   npm run dev:backend
   ```

2. In a separate terminal, start the frontend dev server:
   ```bash
   npm run dev
   ```

3. In another terminal, start Tauri in dev mode:
   ```bash
   npm run tauri:dev
   ```

This will:
- Launch the Tauri window
- Connect to the Next.js dev server at `http://localhost:3000`
- Automatically start the backend as a child process
- Enable hot-reload for both frontend and backend changes

## Building for Production

### Quick Build (For Testing - Faster)

For faster builds when you just want to test the production executable:

```bash
npm run tauri:build:quick
```

This will:
- Build the frontend static files
- Compile the Rust application in release mode
- Create the executable (`MAX Desktop.exe`)
- **Skip installer creation** (saves 3-5 minutes)
- **Time: ~5-8 minutes** (vs 10-15 minutes for full build)

**Output:** `src-tauri/target/release/MAX Desktop.exe`

### Full Production Build (For Distribution)

For creating distributable installers:

#### Step 1: Build the Frontend

Build the frontend as a static export:
```bash
npm run build:web:desktop
```

This creates a static build in `frontend/out/` that Tauri will bundle.

#### Step 2: Build the Tauri Application

Build the desktop application:
```bash
npm run tauri:build
```

This will:
- Compile the Rust Tauri application
- Bundle the frontend static files
- Bundle the backend code as a resource
- Create Windows installers (`.exe` and `.msi`) in `src-tauri/target/release/`
- **Time: ~10-15 minutes**

### Output Files

After a **full build** (`npm run tauri:build`), you'll find:
- `src-tauri/target/release/MAX Desktop.exe` - Portable executable
- `src-tauri/target/release/bundle/nsis/MAX Desktop_*.exe` - NSIS installer
- `src-tauri/target/release/bundle/msi/MAX Desktop_*.msi` - MSI installer

After a **quick build** (`npm run tauri:build:quick`), you'll find:
- `src-tauri/target/release/MAX Desktop.exe` - Portable executable only (no installers)

### When to Use Which Build

- **`npm run tauri:dev`** - Daily development (fastest, hot reload)
- **`npm run tauri:build:quick`** - Testing production builds (faster, no installers)
- **`npm run tauri:build`** - Creating distributable installers (slowest, full build)

## Distribution

### Creating a Release

1. **Update Version**: Update the version in `src-tauri/tauri.conf.json` and `package.json`

2. **Build**: Run `npm run tauri:build`

3. **Generate Update Manifest**: Tauri will generate a `latest.json` file in the release directory

4. **Create GitHub Release**:
   - Create a new tag: `git tag v1.0.0`
   - Push the tag: `git push origin v1.0.0`
   - Create a GitHub Release and upload:
     - The `.exe` installer
     - The `.msi` installer
     - The `latest.json` update manifest

5. **Update Updater Configuration**: Ensure `src-tauri/tauri.conf.json` points to the correct GitHub Releases URL

### Auto-Updater Setup

1. **Generate Signing Key** (one-time setup):
   ```bash
   cd src-tauri
   cargo tauri signer generate -w ~/.tauri/myapp.key
   ```

2. **Update Public Key**: Copy the generated public key to `src-tauri/tauri.conf.json` under `tauri.updater.pubkey`

3. **Sign Updates**: When creating releases, sign the update manifest:
   ```bash
   cargo tauri signer sign ~/.tauri/myapp.key src-tauri/target/release/bundle/msi/latest.json
   ```

## Configuration

### Backend Configuration

The backend automatically detects desktop mode via the `MAX_ENV` environment variable:
- `MAX_ENV=desktop` - Desktop mode (uses local app data directory)
- Not set - Web mode (uses `backend/storage`)

### Data Persistence

In desktop mode, data is stored in:
- **Windows**: `%APPDATA%\com.max.desktop\data\`
- **Development**: `backend/storage/`

Files stored:
- `sectors.json`
- `agents.json`
- `debates.json` (discussions data - legacy filename)

### GPU Acceleration

To enable GPU-accelerated agent inference:
1. Set `MAX_USE_GPU=true` environment variable
2. Install `onnxruntime-node` in the backend:
   ```bash
   cd backend
   npm install onnxruntime-node
   ```
3. Place your ONNX model at `backend/gpu/models/agent_policy.onnx`

The system will automatically:
- Detect available GPU (CUDA/DirectML)
- Fall back to CPU if GPU is unavailable
- Use rule-based logic if ONNX Runtime is not available

## Troubleshooting

### Backend Fails to Start

- Check that Node.js is installed and in PATH
- Verify `backend/server.js` exists
- Check the console for error messages
- In dev mode, ensure the backend port (4000) is not in use

### Frontend Can't Connect to Backend

- Verify the backend is running on `http://127.0.0.1:4000`
- Check the health endpoint: `http://127.0.0.1:4000/health`
- Ensure CORS is properly configured in the backend

### Build Fails

- Ensure Rust is properly installed: `rustc --version`
- Check that all dependencies are installed: `npm install`
- Verify Windows SDK is installed (for Windows builds)
- Check `src-tauri/Cargo.toml` for correct dependencies

### "Access is denied" Error During Build

If you see an error like `failed to rename ... Access is denied (os error 5)`:

1. **Close any running instances** of the MAX Desktop application
2. **Manually stop processes** (if needed):
   ```powershell
   Get-Process | Where-Object { $_.ProcessName -like "*max-desktop*" } | Stop-Process -Force
   ```
3. **Delete the existing executable** (if it exists):
   ```powershell
   Remove-Item "src-tauri\target\release\MAX Desktop.exe" -Force -ErrorAction SilentlyContinue
   ```
4. **Retry the build**: `npm run tauri:build`

The build script now automatically handles this by stopping running instances before building.

### Icons Not Showing

- Ensure icon files exist in `src-tauri/icons/`
- Generate icons from a source image using Tauri CLI:
  ```bash
  cargo tauri icon path/to/icon.png
  ```

## Architecture

### Desktop Mode Flow

1. **Tauri Application Starts**
   - Determines app data directory
   - Spawns Node.js backend as child process
   - Sets environment variables (`MAX_ENV=desktop`, `MAX_PORT=4000`, `MAX_APP_DATA_DIR`)

2. **Backend Starts**
   - Reads environment variables
   - Binds to `127.0.0.1:4000`
   - Uses app data directory for persistence
   - Exposes health endpoint at `/health`

3. **Tauri Waits for Backend**
   - Polls `/health` endpoint
   - Once ready, loads frontend from bundled static files

4. **Frontend Connects**
   - Detects desktop mode via `window.__TAURI__`
   - Connects to `http://127.0.0.1:4000`
   - All API calls go through local backend

5. **App Closes**
   - Tauri receives close event
   - Stops backend child process
   - Cleans up resources

## Notes

- The desktop app bundles the backend code but requires Node.js to be installed on the target machine (or bundled separately)
- For a fully self-contained app, consider bundling Node.js as a resource or using a different runtime
- GPU acceleration is optional and requires ONNX Runtime and compatible hardware
- Auto-updater requires proper signing keys and GitHub Releases setup

