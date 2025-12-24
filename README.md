# MAX: Multi-Sector Agentic Financial Simulation

## Overview

MAX is a multi-sector NYSE-style agentic financial simulation platform where users create autonomous agents that discuss, coordinate, and execute simulated trades using MNEE (Multi-Nodal Economic Exchange) principles. The system enables sophisticated financial modeling through intelligent agent interactions, sector-based market segmentation, and high-fidelity trading simulation.

## What is MAX?

MAX is a comprehensive financial simulation ecosystem that combines:

- **Autonomous Agent Creation**: Users can design and deploy intelligent trading agents (LLM-powered or rule-based)
- **Multi-Sector Markets**: NYSE-style market structure with sector-based organization
- **Agentic Coordination**: Agents discuss, negotiate, and coordinate trading strategies in dedicated discussion rooms
- **High-Fidelity Simulation**: Realistic orderbook mechanics and execution engine
- **Blockchain Integration**: Smart contract support for transparent and verifiable transactions
- **Modern UI/UX**: Intuitive interface for monitoring and interacting with the simulation

---

# Development Guide

This guide provides everything developers need to set up, install, and run the MAX project for development and testing.

## Table of Contents

1. [Prerequisites & Installation](#prerequisites--installation)
2. [Environment Setup](#environment-setup)
3. [Running the Application](#running-the-application)
4. [Project Structure](#project-structure)
5. [Git Workflow](#git-workflow)
6. [Additional Resources](#additional-resources)

---

## Prerequisites & Installation

### Required Software

#### 1. Node.js (Required)

**Download:** [https://nodejs.org/en/download/current](https://nodejs.org/en/download/current)

- **Recommended Version:** Node.js v18.x LTS or v20.x LTS
- **npm Version:** v9.x or higher (comes with Node.js)
- **Alternative Package Manager:** pnpm v8.x or higher (recommended for monorepo management)

**Installation Steps:**
1. Download the installer for your operating system from the link above
2. Run the installer and follow the setup wizard
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```

#### 2. LM Studio (Required)

**Download:** [https://lmstudio.ai/](https://lmstudio.ai/)

LM Studio is **REQUIRED** for MAX to function. The entire premise of MAX is based on LLM-powered agents, and LM Studio provides the local LLM server.

**Installation Steps:**
1. Download and install LM Studio from the official website
2. Open LM Studio
3. Download the required model:
   - **Model:** `llama-3.2-3b-instruct`
   - Search for: `lmstudio-community/Llama-3.2-3B-Instruct-GGUF`
   - Recommended file: `Llama-3.2-3B-Instruct-Q4_K_M.gguf` (~2.02 GB)

**LM Studio Server Setup:**
1. In LM Studio, load the `llama-3.2-3b-instruct` model
2. Navigate to the "Local Server" tab (or "Server" section)
3. Ensure the model shows as "READY" status
4. Toggle "Status: Running" to **ON**
5. Verify the server is running:
   - Check the "Developer Logs" - should show: `[LM STUDIO SERVER] Success! HTTP server listening on port 1234`
   - Server should be reachable at: `http://127.0.0.1:1234` or `http://localhost:1234`
6. The server must remain running while developing/testing MAX

**API Endpoints Available:**
- `GET http://localhost:1234/v1/models`
- `POST http://localhost:1234/v1/chat/completions` (used by MAX)
- `POST http://localhost:1234/v1/completions`
- `POST http://localhost:1234/v1/embeddings`

**Important Notes:**
- Keep LM Studio running whenever you're testing MAX
- The backend will fail to make LLM calls if LM Studio is not running
- Default port is `1234` - if you change it, update your `.env` file accordingly

#### 3. Python (Optional - For Future Features)

**Download:** [https://www.python.org/downloads/](https://www.python.org/downloads/)

- **Status:** Optional - Python files in `backend/app/` are for future/optional features
- **Recommended Version:** Python 3.11 or higher
- Currently used for: SQLAlchemy models and market simulator services (future features)

**Installation Steps:**
1. Download the latest Python version from the link above
2. During installation, check "Add Python to PATH"
3. Verify installation:
   ```bash
   python --version
   pip --version
   ```

#### 4. Git (Required)

**Download:** [https://git-scm.com/downloads](https://git-scm.com/downloads)

Git is required for version control and collaboration.

**Installation Steps:**
1. Download Git for your operating system
2. Follow the installation wizard
3. Configure Git (if first time):
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your.email@example.com"
   ```
4. Verify installation:
   ```bash
   git --version
   ```

### Optional Software

#### Hardhat (Optional - For Smart Contract Development)

**What is Hardhat?** Hardhat is a development environment for Ethereum smart contracts. It's used for compiling, testing, and deploying Solidity smart contracts.

**When is it needed?**
- Only required if you're working on smart contract development in the `/contracts` folder
- Not required for basic frontend/backend development
- The backend can run without blockchain features (smart contract features are optional)

**Installation:**
Hardhat is installed as a local dependency in the `contracts` folder. No global installation needed.

**To use Hardhat:**
```bash
cd contracts
npm install
npx hardhat node  # Start local blockchain node
```

---

## Environment Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd MAX
```

### 2. Install Dependencies

Install dependencies for all modules:

```bash
# Using npm (from project root)
npm run install:all

# Or manually install each module:
cd frontend && npm install && cd ..
cd backend && npm install && cd ..
cd contracts && npm install && cd ..
```

**Recommended:** Use pnpm for better monorepo management:
```bash
# Install pnpm globally (if not already installed)
npm install -g pnpm

# Install all dependencies
pnpm install
```

### 3. Configure Environment Variables

#### Backend Environment Variables

Create a `.env` file in the `backend` directory:

```env
# ============================================
# LLM Configuration (REQUIRED)
# ============================================
# Enable LLM functionality
USE_LLM=true

# LM Studio server URL (default: http://localhost:1234)
LLM_BASE_URL=http://localhost:1234

# Model name (must match the model loaded in LM Studio)
LLM_MODEL_NAME=llama-3.2-3b-instruct

# API Key (optional - usually not needed for LM Studio)
# LLM_API_KEY=

# Response format: 'text' or 'json' (default: 'text')
LLM_RESPONSE_FORMAT=text

# ============================================
# Server Configuration
# ============================================
# Server port (default: 8000 for web, 4000 for desktop)
PORT=8000

# Environment mode: 'web' or 'desktop'
MAX_ENV=web

# App data directory (for desktop mode)
# MAX_APP_DATA_DIR=

# ============================================
# Smart Contract Configuration (Optional)
# ============================================
# MaxRegistry contract address (required only if using blockchain features)
# Deploy contract first using: cd contracts && npm run deploy
MAX_REGISTRY=0x5FbDB2315678afecb367f032d93F642f64180aa3

# RPC URL for blockchain (default: http://localhost:8545 for Hardhat)
RPC_URL=http://localhost:8545

# Private key for blockchain transactions (optional)
# PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

#### Frontend Environment Variables (Optional)

The frontend typically doesn't require environment variables for basic development. If needed, create a `.env.local` file in the `frontend` directory:

```env
# API endpoint (defaults to http://localhost:8000)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. Verify LM Studio is Running

Before starting the backend, ensure LM Studio is running:

1. Open LM Studio
2. Load the `llama-3.2-3b-instruct` model
3. Start the local server (toggle "Status: Running" to ON)
4. Verify server is accessible at `http://localhost:1234`
5. Check developer logs for: `[LM STUDIO SERVER] Success! HTTP server listening on port 1234`

---

## Running the Application

### Development Mode

#### Step 1: Start LM Studio Server

1. Open LM Studio
2. Load `llama-3.2-3b-instruct` model
3. Start the local server (port 1234)
4. Keep LM Studio running

#### Step 2: Start the Backend Server

Open a terminal and navigate to the backend directory:

```bash
cd backend
npm run dev
# or
pnpm dev
```

**Expected Output:**
```
🚀 MAX Backend Server listening on 0.0.0.0:8000
📍 Environment: web
📍 Health check: http://0.0.0.0:8000/health
📍 API Routes:
   - /api/sectors
   - /api/agents
   - /api/discussions
   - /api/simulation
   - /api/system
   - /api/user
   - /api/execution
   - /api/executionLogs
   - /api/decision-logs
   - /api/price-history
   - /debug
```

**Backend API will be available at:** `http://localhost:8000`

**Troubleshooting:**
- If backend fails to start, check that LM Studio is running
- Verify `.env` file exists in `backend/` directory
- Check that `USE_LLM=true` and `LLM_BASE_URL` is correct
- Ensure port 8000 is not already in use

#### Step 3: Start the Frontend Server

Open a **new terminal** and navigate to the frontend directory:

```bash
cd frontend
npm run dev
# or
pnpm dev
```

**Expected Output:**
```
  ▲ Next.js 14.x.x
  - Local:        http://localhost:3000
  - ready started server on 0.0.0.0:3000
```

**Frontend will be available at:** `http://localhost:3000`

**Troubleshooting:**
- If frontend fails to start, check that port 3000 is not already in use
- Verify backend is running on port 8000
- Check browser console for API connection errors

### Testing New Changes

1. **Backend Changes:**
   - Backend uses `nodemon` for auto-reload
   - Changes to backend files will automatically restart the server
   - Check terminal for restart messages

2. **Frontend Changes:**
   - Frontend uses Next.js hot reload
   - Changes to frontend files will automatically refresh in the browser
   - Check browser for compilation status

3. **Testing Workflow:**
   ```
   1. Make code changes
   2. Save files
   3. Wait for auto-reload (backend) or hot reload (frontend)
   4. Test changes in browser (frontend) or via API calls (backend)
   5. Check console/terminal for errors
   ```

### Production Build (Optional)

To build for production:

```bash
# Build frontend
cd frontend
npm run build
npm start

# Build backend (no build step needed, just run)
cd backend
npm start
```

---

## Project Structure

```
MAX/
├── backend/                 # Node.js/Express backend server
│   ├── agents/             # Agent system (LLM-powered, rule-based)
│   ├── ai/                # LLM client and AI utilities
│   ├── app/               # Python services (future/optional features)
│   │   ├── models/        # SQLAlchemy models
│   │   ├── seed/          # Database seeding scripts
│   │   └── services/     # Market simulator services
│   ├── config/            # Configuration files
│   ├── controllers/       # Request controllers
│   ├── core/              # Core engines (Simulation, Discussion, etc.)
│   ├── discussions/       # Discussion room workflow
│   ├── gpu/               # GPU acceleration utilities
│   ├── manager/           # Manager agent logic
│   ├── migrations/        # Database migrations
│   ├── models/            # Data models
│   ├── routes/            # API route handlers
│   ├── simulation/        # Simulation engine components
│   ├── storage/           # File-based storage (JSON files)
│   ├── utils/             # Utility functions
│   ├── server.js          # Main server entry point
│   ├── package.json       # Backend dependencies
│   └── .env               # Backend environment variables (create this)
│
├── frontend/               # Next.js frontend application
│   ├── app/               # Next.js app router pages
│   ├── components/        # React components
│   ├── hooks/             # React hooks
│   ├── lib/               # Utility libraries
│   ├── public/            # Static assets
│   ├── styles/            # CSS styles
│   ├── utils/             # Frontend utilities
│   ├── package.json       # Frontend dependencies
│   └── next.config.js     # Next.js configuration
│
├── contracts/             # Smart contracts (Solidity)
│   ├── contracts/         # Solidity contract files
│   ├── scripts/           # Deployment scripts
│   ├── test/              # Contract tests
│   ├── hardhat.config.js  # Hardhat configuration
│   └── package.json       # Contract dependencies
│
├── shared/                # Shared TypeScript code
│   └── (shared utilities between frontend and backend)
│
├── docs/                  # Project documentation
│   └── MNEE_INTEGRATION_GUIDE.md
│
├── src-tauri/             # Tauri desktop app (Rust)
│   ├── src/               # Rust source code
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
│
├── scripts/               # Build and utility scripts
├── package.json           # Root package.json
└── README.md              # This file
```

### Key Directories Explained

- **`backend/`**: Main API server handling agents, sectors, discussions, and simulation logic
- **`frontend/`**: Next.js web application for user interface
- **`contracts/`**: Solidity smart contracts for blockchain integration (optional)
- **`backend/storage/`**: File-based JSON storage (used in current implementation)
- **`backend/app/`**: Python services for future features (optional)

---

## Git Workflow

### Branch Structure

**IMPORTANT:** All work happens on the `main` branch. Follow these guidelines:

#### Standard Workflow

1. **Always start from main:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Before every commit, sync with remote:**
   ```bash
   git fetch origin main
   git pull origin main
   ```

3. **Review recent commits:**
   ```bash
   git log --oneline -10
   ```

4. **Make your changes and commit:**
   ```bash
   git add .
   git commit -m "Clear descriptive message"
   git push origin main
   ```

### Commit Message Format

Use clear, descriptive commit messages:

**Good Examples:**
```bash
git commit -m "Add agent creation endpoint"
git commit -m "Fix discussion room state management"
git commit -m "Update LLM client error handling"
git commit -m "Add sector price history API"
```

**Bad Examples:**
```bash
git commit -m "fix"
git commit -m "updates"
git commit -m "WIP"
```

### Commit Guidelines

- **One feature/fix per commit**: Keep commits atomic
- **Test before committing**: Ensure your changes work
- **Pull before pushing**: Always sync with remote first
- **Clear messages**: Describe what and why, not how

### Handling Conflicts

If you encounter merge conflicts:

1. **STOP immediately**
2. **Do NOT attempt to resolve automatically**
3. **Ask for guidance** from the team
4. **Review conflicting changes** carefully
5. **Coordinate** with other developers if needed

### Example Development Session

```bash
# 1. Start fresh
git checkout main
git pull origin main

# 2. Make changes to files
# ... edit code ...

# 3. Before committing, sync again
git fetch origin main
git pull origin main

# 4. Check for conflicts
git status

# 5. If clean, commit
git add .
git commit -m "Add new feature: agent performance tracking"
git push origin main
```

---

## Additional Resources

### Documentation

- **Architecture Analysis:** See `backend/ARCHITECTURE_ANALYSIS.md`
- **MNEE Integration:** See `docs/MNEE_INTEGRATION_GUIDE.md`
- **API Endpoints:** Check `backend/routes/` for available endpoints

### Useful Commands

**Backend:**
```bash
cd backend
npm run dev          # Start development server
npm start            # Start production server
npm test             # Run tests
```

**Frontend:**
```bash
cd frontend
npm run dev          # Start development server
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run linter
```

**Contracts (Optional):**
```bash
cd contracts
npm run compile      # Compile smart contracts
npm run deploy       # Deploy contracts
npm run test         # Run contract tests
npx hardhat node     # Start local blockchain node
```

### Troubleshooting

**Backend won't start:**
- Check LM Studio is running on port 1234
- Verify `.env` file exists and is configured correctly
- Check port 8000 is not in use
- Review backend terminal for error messages

**Frontend won't connect to backend:**
- Verify backend is running on port 8000
- Check CORS settings in backend
- Verify API URL in frontend code
- Check browser console for errors

**LM Studio connection issues:**
- Ensure LM Studio server is running
- Verify model is loaded and shows "READY"
- Check `LLM_BASE_URL` in `.env` matches LM Studio port
- Test LM Studio API: `curl http://localhost:1234/v1/models`

**Port conflicts:**
- Backend default: 8000 (change in `.env` if needed)
- Frontend default: 3000 (Next.js will use next available)
- LM Studio default: 1234 (change in LM Studio settings if needed)

### Getting Help

- Check existing documentation in `/docs`
- Review `backend/ARCHITECTURE_ANALYSIS.md` for system details
- Check Git commit history for recent changes
- Ask team members for guidance

---

## Recommended Versions

- **Node.js**: 18.x LTS or 20.x LTS
- **npm**: 9.x or higher
- **pnpm**: 8.x or higher (recommended)
- **Python**: 3.11+ (optional, for future features)
- **LM Studio**: Latest version
- **Model**: llama-3.2-3b-instruct (Q4_K_M quantization recommended)

---

## License

[License information to be added]
