# MAX: Multi-Sector Agentic Financial Simulation

## Overview

**MAX** (Multi-Agent eXecution System) is an intelligent financial trading platform that uses AI-powered agents to help users navigate the complex, noisy world of financial markets. By deploying specialized agents across different market sectors, MAX filters out market noise and makes informed trading decisions based on user-defined goals and strategies.

### The Problem MAX Solves

Financial markets are incredibly complex and noisy. At any given moment, there are:
- Thousands of assets across multiple sectors (technology, crypto, fashion, healthcare, etc.)
- Constant news, sentiment shifts, and market movements
- Overwhelming amounts of data to analyze
- Multiple trading opportunities happening simultaneously

**MAX solves this by:**
- **Sector Specialization**: Allowing users to create dedicated sectors (e.g., "Technology Stocks", "Cryptocurrency", "Fashion Industry")
- **AI Agent Delegation**: Deploying specialized AI agents to monitor and analyze each sector
- **Intelligent Collaboration**: Agents discuss and refine ideas before making decisions
- **Automated Execution**: Manager agents execute approved trades using MNEE (USD stablecoin on Bitcoin SV)
- **Systematic Approach**: Converting chaotic market data into structured, actionable investment strategies

### What Makes MAX Unique

Unlike traditional trading platforms or simple trading bots, MAX employs a **multi-agent collaborative system** where:

1. **Agents Think Independently**: Each agent analyzes market conditions using LLM reasoning or rule-based logic
2. **Agents Collaborate**: Agents discuss ideas, refine strategies, and reach consensus before acting
3. **Agents Execute Systematically**: Manager agents execute approved actions using blockchain-based transactions
4. **Users Stay in Control**: Users define sectors, configure agents, and monitor all activity through an intuitive interface

---

## What is MAX? A Comprehensive Guide

### Core Concept

MAX is a **multi-agent financial trading system** that combines:
- **AI-Powered Decision Making**: LLM (Large Language Model) agents that reason like humans about market conditions
- **NYSSE-Style Market Structure**: Organized sectors representing different areas of finance
- **Collaborative Intelligence**: Agents that discuss, debate, and refine trading strategies together
- **Blockchain Execution**: Real trades executed using MNEE (Multi-Nodal Economic Exchange) - a USD stablecoin on Bitcoin SV
- **Dual Mode Operation**: Can operate in **simulation mode** (paper trading) or **live mode** (actual market trading)

### How MAX Works: The Complete Workflow

#### 1. **Sector Creation**
Users start by creating **sectors** - specialized areas of the financial market they want to focus on:
- **Examples**: "Technology Stocks", "Cryptocurrency", "Fashion Industry", "Healthcare", "Energy"
- Each sector represents a distinct market segment with its own dynamics
- Users provide a sector name and description of goals using natural language

#### 2. **Agent Deployment**
For each sector, MAX automatically creates:
- **1 Manager Agent**: Oversees the sector, reviews proposals, and executes approved trades
- **Up to 4 Custom Agents**: User-defined agents with specific roles and behaviors

**Custom Agents are created by:**
- Providing natural language prompts describing what the agent should do
- Defining how the agent should operate (research-focused, risk-averse, aggressive, etc.)
- Setting rules the agent must follow

**Agent Types:**
- **Research Agents**: Analyze news, sentiment, and market trends
- **Analyst Agents**: Process market data, price signals, and technical indicators
- **Specialized Agents**: User-defined roles for specific strategies

#### 3. **Continuous Agent Analysis**
All agents run continuously and maintain a **confidence score** between **-100 and +100**:
- Agents analyze market conditions using their assigned logic
- When agents identify profitable opportunities, their confidence increases
- Confidence reflects how strongly an agent believes in a trading idea
- Agents update confidence dynamically based on market changes

#### 4. **Discussion Trigger**
A **discussion automatically begins** when:
- **All custom agents in a sector reach confidence ≥ 65** (threshold adjustable by manager agent)
- This signals that all agents believe they have valuable contributions to make
- The system creates a discussion room where agents can collaborate

#### 5. **Collaborative Discussion Process**
Once triggered, agents engage in structured collaboration:

**Phase 1: Idea Presentation**
- Each agent presents their trading idea or strategy
- Ideas are structured and include reasoning, risk assessment, and proposed actions

**Phase 2: Discussion & Refinement**
- Agents read each other's proposals
- Agents discuss, debate, and refine ideas together
- Similar ideas are consolidated
- Conflicting ideas are resolved through discussion
- Agents adjust their proposals to reach consensus

**Phase 3: Checklist Creation**
- Agents collaborate to create a **checklist of executable items**
- Checklist items include:
  - **BUY** actions (purchase assets)
  - **SELL** actions (sell holdings)
  - **REBALANCE** actions (adjust portfolio allocations)
  - **HOLD** actions (maintain current positions)
  - Custom investment actions

**Why Discussion Matters:**
- Filters out weak or conflicting ideas
- Combines similar strategies for better execution
- Ensures all agents are satisfied with the final plan
- Creates a more robust, well-thought-out strategy than any single agent could produce

#### 6. **Manager Agent Review**
The Manager Agent receives the checklist and:

**Review Process:**
- Reviews each checklist item individually
- **Approves** items that align with sector goals and risk parameters
- **Rejects** items that are too risky, unclear, or misaligned
- Provides feedback on rejected items

**Iteration:**
- Rejected items are sent back to the discussion
- Agents refine or drop rejected ideas based on feedback
- Discussion continues until:
  - All items are approved or dropped
  - All agents reach consensus
  - Discussion is closed

#### 7. **Execution via MNEE**
For each **approved** checklist item, the Manager Agent:

**Execution Process:**
- Uses **MNEE** (Multi-Nodal Economic Exchange) - a USD stablecoin on Bitcoin SV blockchain
- Executes trades through blockchain transactions
- Each manager agent has its own HD wallet for isolated operations
- Transactions are permanently recorded on-chain for full audit trails

**Execution Actions:**
- **BUY**: Purchase assets using MNEE
- **SELL**: Sell holdings and receive MNEE
- **REBALANCE**: Adjust portfolio allocations
- **HOLD**: Maintain current positions

**MNEE Integration:**
- MNEE is a USD-pegged stablecoin on Bitcoin SV
- Provides transparent, verifiable transaction execution
- Enables real-world trading (not just simulation)
- See [MNEE Integration Guide](docs/MNEE_INTEGRATION_GUIDE.MD) for technical details
- Learn more: [MNEE GitHub Repository](https://github.com/mnee-xyz/mnee)

#### 8. **Monitoring & Analytics**
Users can monitor the entire system through the MAX interface:

**What Users Can See:**
- **Sector Status**: Performance of individual sectors or all sectors combined
- **Agent Statistics**: Confidence levels, performance metrics, trade history per agent
- **Active Discussions**: Current discussions, proposals, and checklist items
- **Execution Logs**: All executed trades with timestamps, amounts, and results
- **Market Data**: Real-time prices, trends, and sector performance

### Key Concepts Explained

#### **Sectors**
- **Definition**: Distinct areas of the financial market (e.g., Technology, Crypto, Fashion)
- **Purpose**: Organize trading activity and enable specialized agent focus
- **Structure**: Each sector has 1 manager agent + up to 4 custom agents
- **Isolation**: Sectors operate independently but can share market data

#### **Agents**
- **Manager Agents**: Supervisory agents that review proposals and execute trades
- **Custom Agents**: User-defined agents with specific roles and behaviors
- **Confidence System**: Agents maintain confidence scores (-100 to +100) reflecting belief in trading ideas
- **Decision Making**: Agents use LLM reasoning (treating LLMs like humans) or rule-based logic
- **Collaboration**: Agents discuss ideas before acting, ensuring better decisions

#### **Discussions**
- **Trigger**: Automatically start when all custom agents reach confidence ≥ 65
- **Purpose**: Collaborative refinement of trading strategies
- **Process**: Agents present ideas → discuss → refine → create checklist
- **Outcome**: Checklist of executable items sent to manager for review
- **Belonging**: Discussions belong to sectors; agents participate if confidence ≥ 65

#### **MNEE (Multi-Nodal Economic Exchange)**
- **What it is**: USD stablecoin on Bitcoin SV blockchain
- **Purpose**: Execute real trades (not just simulation)
- **Integration**: Manager agents use MNEE SDK to execute approved trades
- **Benefits**: Transparent, verifiable, on-chain transaction records
- **Technical**: Uses UTXO model, atomic units (1 MNEE = 100,000 atomic units)

### Use Cases

#### **1. Real Trading**
- Deploy agents across multiple sectors
- Let agents analyze, discuss, and execute trades automatically
- Monitor performance and adjust strategies
- **Goal**: Make money through systematic, AI-assisted trading

#### **2. Paper Trading / Simulation**
- Test strategies without risking real money
- Understand how agents behave under different market conditions
- Refine agent configurations before going live
- **Goal**: Learn and optimize before real trading

#### **3. Research & Development**
- Study how LLMs behave in financial decision-making scenarios
- Fine-tune models for custom usage in MAX
- Research multi-agent collaboration patterns
- **Goal**: Advance AI research in financial applications

#### **4. Portfolio Management**
- Diversify across multiple sectors
- Automate rebalancing and allocation adjustments
- Monitor multiple market segments simultaneously
- **Goal**: Systematic, diversified investment approach

### Technical Approach

#### **Why LLM-Powered Agents?**
MAX uses Large Language Models (specifically `llama-3.2-3b-instruct` via LM Studio) because:
- **Human-like Reasoning**: LLMs can process complex information and reason like humans
- **Natural Language Processing**: Agents can understand market news, sentiment, and qualitative data
- **Flexible Decision Making**: Unlike rigid rule-based systems, LLMs can adapt to new situations
- **Information Synthesis**: Agents can combine multiple data sources into informed decisions

#### **Multi-Agent Coordination**
- **Independent Analysis**: Each agent analyzes markets independently
- **Collaborative Refinement**: Agents discuss and refine ideas together
- **Consensus Building**: Discussion process ensures all agents agree before execution
- **Systematic Execution**: Manager agents execute approved actions systematically

#### **Market Structure**
- **NYSSE-Style Organization**: Sectors organize markets like stock exchanges organize industries
- **Orderbook System**: Real-time order matching and price discovery
- **Execution Engine**: Handles market orders, limit orders, and trade settlement
- **Price Discovery**: Dynamic pricing based on agent actions and market conditions

### What MAX Provides

1. **Sector Creation**: Define market segments to focus on
2. **Agent Creation**: Build custom agents with natural language prompts
3. **Automatic Workflows**: Agents continuously analyze and act without constant user intervention
4. **Automated Money Making**: System executes trades automatically based on agent decisions
5. **Systematic Investing**: Structured approach to managing multiple market segments
6. **AI Reasoning**: LLM-powered decision making that adapts to market conditions
7. **Full Transparency**: Monitor all agent activity, discussions, and executions
8. **Dual Mode**: Switch between simulation and live trading modes

---

## What is MAX? (Quick Summary)

MAX is a comprehensive financial trading ecosystem that combines:

- **Autonomous Agent Creation**: Users design and deploy intelligent trading agents (LLM-powered or rule-based) using natural language prompts
- **Multi-Sector Markets**: NYSSE-style market structure organizing different areas of finance (Technology, Crypto, Fashion, etc.)
- **Collaborative Intelligence**: Agents discuss, debate, and refine trading strategies together before execution
- **Systematic Execution**: Manager agents execute approved trades using MNEE (USD stablecoin on Bitcoin SV blockchain)
- **Dual Mode Operation**: Supports both simulation (paper trading) and live trading modes
- **Full Transparency**: Complete visibility into agent reasoning, discussions, and execution logs
- **Modern UI/UX**: Intuitive interface for creating sectors, configuring agents, and monitoring all activity

### The MAX Advantage

**Traditional Trading Platforms:**
- Require constant manual monitoring
- Overwhelm users with raw market data
- Force users to make all decisions themselves
- Provide limited automation

**MAX:**
- ✅ **Automates Analysis**: Agents continuously monitor markets
- ✅ **Filters Noise**: Focuses on relevant opportunities in chosen sectors
- ✅ **Collaborative Decisions**: Multiple agents discuss and refine strategies
- ✅ **Systematic Execution**: Automated trade execution based on agent consensus
- ✅ **User Control**: Users define goals, sectors, and agent behaviors
- ✅ **Full Transparency**: See exactly how and why decisions are made

---

## Core Modules

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

MAX follows a **Git Flow** branching strategy for proper software engineering practices. This ensures code quality, enables parallel development, and maintains a stable main branch.

#### Branch Types

1. **`main`** - Production-ready code
   - Only contains tested, reviewed, and stable code
   - Protected branch (requires pull request and approval)
   - Deployed to production

2. **`develop`** - Integration branch for features
   - Main development branch
   - All feature branches merge here first
   - Should always be in a deployable state

3. **`feature/`** - New features
   - Branch from: `develop`
   - Merge back to: `develop`
   - Naming: `feature/agent-performance-tracking`, `feature/discussion-ui`

4. **`fix/`** - Bug fixes
   - Branch from: `develop`
   - Merge back to: `develop`
   - Naming: `fix/llm-connection-error`, `fix/sector-price-calculation`

5. **`hotfix/`** - Urgent production fixes
   - Branch from: `main`
   - Merge back to: `main` and `develop`
   - Naming: `hotfix/critical-security-patch`, `hotfix/api-crash-fix`

### Standard Workflow

#### Starting a New Feature

1. **Ensure you're on develop and up-to-date:**
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Work on your feature:**
   ```bash
   # Make your changes
   # ... edit code ...
   
   # Commit frequently with clear messages
   git add .
   git commit -m "Add agent performance tracking endpoint"
   git commit -m "Implement performance calculation logic"
   ```

4. **Keep your branch updated with develop:**
   ```bash
   # Periodically sync with develop
   git checkout develop
   git pull origin develop
   git checkout feature/your-feature-name
   git merge develop
   # Resolve any conflicts if needed
   ```

5. **Push your feature branch:**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request:**
   - Open a PR from `feature/your-feature-name` → `develop`
   - Request code review
   - Address review feedback
   - Once approved, merge to `develop`

#### Starting a Bug Fix

1. **Create a fix branch from develop:**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b fix/bug-description
   ```

2. **Fix the bug and commit:**
   ```bash
   # Make fixes
   git add .
   git commit -m "Fix: Resolve LLM connection timeout issue"
   git push origin fix/bug-description
   ```

3. **Create Pull Request to `develop`**

#### Hotfix Workflow (Production Issues)

1. **Create hotfix from main:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/critical-issue
   ```

2. **Fix the issue:**
   ```bash
   # Make urgent fix
   git add .
   git commit -m "Hotfix: Fix critical API crash in agent execution"
   ```

3. **Merge to main and develop:**
   ```bash
   # Merge to main
   git checkout main
   git merge hotfix/critical-issue
   git push origin main
   
   # Also merge to develop
   git checkout develop
   git merge hotfix/critical-issue
   git push origin develop
   ```

### Commit Message Format

Use clear, descriptive commit messages following this format:

**Format:** `<type>: <subject>`

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, no logic change)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

**Good Examples:**
```bash
git commit -m "feat: Add agent creation endpoint"
git commit -m "fix: Resolve discussion room state management issue"
git commit -m "refactor: Update LLM client error handling"
git commit -m "docs: Update API documentation for sectors endpoint"
git commit -m "test: Add unit tests for agent factory"
```

**Bad Examples:**
```bash
git commit -m "fix"
git commit -m "updates"
git commit -m "WIP"
git commit -m "changes"
```

### Commit Guidelines

- **One logical change per commit**: Keep commits atomic and focused
- **Test before committing**: Ensure your changes work and don't break existing functionality
- **Write clear messages**: Describe what changed and why (not how)
- **Commit frequently**: Small, frequent commits are better than large, infrequent ones
- **Don't commit broken code**: Each commit should leave the codebase in a working state

### Pull Request Guidelines

1. **Clear Title**: Descriptive title explaining what the PR does
2. **Description**: 
   - What changes were made
   - Why the changes were needed
   - How to test the changes
   - Any breaking changes
3. **Link Issues**: Reference related issues/tickets
4. **Request Review**: Assign appropriate reviewers
5. **Address Feedback**: Respond to review comments and make requested changes
6. **Keep PRs Small**: Focused PRs are easier to review and merge

### Handling Merge Conflicts

If you encounter merge conflicts:

1. **Don't panic**: Conflicts are normal in collaborative development
2. **Understand the conflict**: Review what changed in both branches
3. **Resolve carefully**: 
   ```bash
   # After merging develop into your feature branch
   git checkout feature/your-feature-name
   git merge develop
   # Git will show conflicts
   # Edit conflicted files, remove conflict markers
   git add .
   git commit -m "Merge develop into feature/your-feature-name"
   ```
4. **Test after resolving**: Ensure everything still works
5. **Ask for help**: If unsure about a conflict, ask the team

### Example Development Session

```bash
# 1. Start a new feature
git checkout develop
git pull origin develop
git checkout -b feature/agent-performance-tracking

# 2. Make changes and commit
# ... edit code ...
git add .
git commit -m "feat: Add performance tracking endpoint"
git commit -m "feat: Implement performance calculation logic"
git commit -m "test: Add tests for performance tracking"

# 3. Keep branch updated
git checkout develop
git pull origin develop
git checkout feature/agent-performance-tracking
git merge develop  # Resolve conflicts if any

# 4. Push and create PR
git push origin feature/agent-performance-tracking
# Create PR: feature/agent-performance-tracking → develop

# 5. After PR approval and merge, clean up
git checkout develop
git pull origin develop
git branch -d feature/agent-performance-tracking  # Delete local branch
git push origin --delete feature/agent-performance-tracking  # Delete remote branch
```

### Branch Naming Conventions

- **Features**: `feature/description-with-dashes`
- **Fixes**: `fix/description-of-bug`
- **Hotfixes**: `hotfix/urgent-issue-description`
- **Use lowercase and hyphens**: No spaces, underscores, or special characters
- **Be descriptive**: Branch name should clearly indicate what it does

**Examples:**
- ✅ `feature/agent-performance-dashboard`
- ✅ `fix/llm-connection-timeout`
- ✅ `hotfix/critical-api-crash`
- ❌ `feature/newStuff`
- ❌ `fix/bug123`
- ❌ `my-branch`

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
