# Backend Architecture Analysis

## Overview
The MAX backend is a Node.js/Fastify-based API server that manages a multi-agent trading simulation system. It coordinates sectors, agents, discussions, decision-making, trade execution, and blockchain integration.

---

## File-by-File Analysis

### Entry Points

#### `server.js`
**Purpose:** Main server entry point that bootstraps the Fastify application, registers routes, and initializes core systems.

**Inputs:**
- Environment variables: `MAX_ENV`, `MAX_PORT`, `PORT`, `MAX_APP_DATA_DIR`, `MAX_REGISTRY`
- Fastify instance

**Outputs:**
- Running HTTP server on configured port/host
- Initialized route handlers
- Started background services (SimulationEngine, AgentRuntime, DiscussionLifecycle)

**Dependencies:**
- `fastify`, `@fastify/cors`, `dotenv`
- All route modules (`routes/*`)
- `simulation/SimulationEngine`
- `agents/runtime/agentRuntime`
- `agents/discussion/discussionLifecycle`

**Interactions:**
- Registers all API routes under `/api/*` prefix
- Bootstraps SimulationEngine for all sectors
- Starts AgentRuntime tick loop (3s interval)
- Starts DiscussionLifecycle auto-loop (15s interval)

**Problems/Issues:**
- Error handling is permissive (doesn't throw on initialization failures)
- No graceful shutdown handling
- Hardcoded intervals (3000ms, 15000ms) - should be configurable

---

#### `index.js`
**Purpose:** Placeholder file (not used - server.js is the actual entry point).

**Status:** Empty/placeholder - should be removed or repurposed.

---

### Routes Layer

#### `routes/index.js`
**Purpose:** Placeholder route aggregator (not used).

**Status:** Empty - routes are registered directly in server.js.

---

#### `routes/agents.js`
**Purpose:** HTTP endpoints for agent management.

**Endpoints:**
- `GET /api/agents` - List all agents with defaults
- `GET /api/agents/:id` - Get single agent
- `POST /api/agents/create` - Create new agent
- `POST /api/agents/:id/morale` - Adjust agent morale

**Inputs:**
- Request body: `{prompt, sectorId}` for creation
- Request body: `{delta}` for morale adjustment

**Outputs:**
- Agent objects (JSON)
- Success/error responses

**Dependencies:**
- `utils/agentStorage`
- `agents/pipeline/createAgent`
- `utils/contract` (registry)
- `agents/morale`

**Interactions:**
- Creates agents via `createAgent()` pipeline
- Auto-registers agents on blockchain (if `MAX_REGISTRY` set)
- Reloads AgentRuntime when manager agents are created
- Updates agent morale via morale system

**Problems/Issues:**
- UUID to uint conversion (`uuidToUint`) is lossy (only uses first 16 hex chars)
- No validation of sectorId existence before agent creation
- Chain registration failures are silently ignored

---

#### `routes/sectors.js`
**Purpose:** HTTP endpoints for sector management and simulation.

**Endpoints:**
- `GET /api/sectors` - List all sectors
- `POST /api/sectors` - Create new sector
- `GET /api/sectors/:id` - Get single sector
- `POST /api/sectors/:id/deposit` - Deposit money into sector
- `POST /api/sectors/:id/simulate-tick` - Run simulation tick
- `POST /api/sectors/:id/update-performance` - Update sector metrics

**Inputs:**
- Request body: `{sectorName, sectorSymbol}` for creation
- Request body: `{amount}` for deposit
- Request body: `{decisions}` for simulate-tick

**Outputs:**
- Sector objects (JSON)
- Simulation tick results
- Success/error responses

**Dependencies:**
- `controllers/sectorsController`
- `utils/contract` (registry)
- `simulation/SimulationEngine`
- `utils/storage`

**Interactions:**
- Creates sectors via controller
- Auto-creates manager agent for new sectors
- Registers sectors on blockchain
- Integrates with SimulationEngine for price simulation
- Updates sector balance and performance metrics

**Problems/Issues:**
- Sector ID type inconsistency: UUIDs in storage, but `parseInt()` used for blockchain (line 49)
- Route ordering matters (`/:id/deposit` must come before `/:id`)
- No validation that sector exists before deposit

---

#### `routes/discussions.js`
**Purpose:** HTTP endpoints for discussion room management.

**Endpoints:**
- `GET /api/discussions` - List discussions (optional `sectorId` filter)
- `GET /api/discussions/:id` - Get single discussion
- `POST /api/discussions` - Create discussion
- `POST /api/discussions/:id/message` - Add message
- `POST /api/discussions/:id/close` - Close discussion
- `POST /api/discussions/:id/archive` - Archive discussion
- `POST /api/discussions/:id/accept` - Accept discussion
- `POST /api/discussions/:id/reject` - Reject discussion
- `POST /api/discussions/:id/collect-arguments` - Trigger argument collection
- `POST /api/discussions/:id/produce-decision` - Trigger decision production

**Inputs:**
- Request body: `{sectorId, title, agentIds}` for creation
- Request body: `{agentId, content, role, agentName}` for messages

**Outputs:**
- DiscussionRoom objects (enriched with agent names)
- Success/error responses

**Dependencies:**
- `models/DiscussionRoom`
- `utils/discussionStorage`
- `agents/discussion/discussionLifecycle`
- `utils/agentStorage`

**Interactions:**
- Creates/manages discussion rooms
- Enriches discussions with agent names from storage
- Integrates with discussion lifecycle for argument collection and decision production
- Supports manual triggers for lifecycle steps

**Problems/Issues:**
- Status mapping in `DiscussionRoom.fromData()` may not cover all legacy statuses
- No validation that agents exist before adding to discussion
- Enrichment happens on every request (could be cached)

---

#### `routes/research.js`
**Purpose:** HTTP endpoint for running research bundles.

**Endpoints:**
- `GET /api/research?sectorId=&topic=` - Run research bundle

**Inputs:**
- Query params: `sectorId` (required), `topic` (required)

**Outputs:**
- Research results object

**Dependencies:**
- `agents/research` (runResearchBundle)

**Interactions:**
- Triggers research agent workflows for sector analysis

**Problems/Issues:**
- Only GET endpoint (should be POST for research operations)
- No caching of research results

---

#### `routes/manager.js`
**Purpose:** HTTP endpoints for manager decision-making.

**Endpoints:**
- `POST /api/manager/decide` - Make decision from agent signals
- `GET /api/manager/status` - Get runtime status
- `GET /api/manager/decisions/:sectorId` - Get decisions for sector

**Inputs:**
- Request body: `{sectorId, signals?, conflictThreshold?, autoExecute?, executionOptions?}`

**Outputs:**
- Decision objects with action, confidence, reason
- Runtime status
- Decision history

**Dependencies:**
- `agents/ManagerAgent` (legacy)
- `agents/manager/ManagerAgent` (new)
- `agents/ExecutionAgent`
- `agents/runtime/agentRuntime`
- `utils/agentStorage`

**Interactions:**
- Gets manager from runtime or creates temporary instance
- Generates mock signals if none provided (for testing)
- Can auto-execute decisions via ExecutionAgent
- Integrates with AgentRuntime for manager state

**Problems/Issues:**
- Dual ManagerAgent classes (legacy vs new) - inconsistent usage
- Mock signal generation for testing should be clearly marked
- Auto-execution logic mixed with decision-making

---

#### `routes/execution.js`
**Purpose:** HTTP endpoints for trade execution.

**Endpoints:**
- `POST /api/execution/execute` - Execute a decision
- `GET /api/execution/logs/:sectorId` - Get execution logs

**Inputs:**
- Request body: `{sectorId, decision, options?}`

**Outputs:**
- Execution results (EXECUTED/REJECTED/ERROR)
- Execution logs

**Dependencies:**
- `agents/ExecutionAgent`

**Interactions:**
- Executes decisions via ExecutionAgent
- Logs execution attempts and results

**Problems/Issues:**
- No rate limiting on execution
- Execution logs stored in JSON file (not scalable)

---

#### `routes/simulation.js`
**Purpose:** HTTP endpoint for simulation performance metrics.

**Endpoints:**
- `GET /api/simulation/performance?sectorId=` - Get performance metrics

**Inputs:**
- Query param: `sectorId` (required)

**Outputs:**
- Performance object: `{startingCapital, currentCapital, pnl, recentTrades}`

**Dependencies:**
- `controllers/sectorsController`
- `simulation/SimulationEngine`

**Interactions:**
- Gets sector state from SimulationEngine
- Calculates P/L from trade history

**Problems/Issues:**
- P/L calculation is simplified (doesn't track actual positions)
- Duplicate `startingCapital` calculation (lines 55 and 82)
- Performance metrics are approximations, not accurate accounting

---

#### `routes/mnee.js`
**Purpose:** HTTP endpoints for blockchain (MNEE) contract interactions.

**Endpoints:**
- `POST /api/mnee/register-sector` - Register sector on-chain
- `POST /api/mnee/register-agent` - Register agent on-chain
- `POST /api/mnee/log-trade` - Log trade on-chain
- `POST /api/mnee/validate` - Validate action on-chain
- `GET /api/mnee/events` - Read all on-chain events

**Inputs:**
- Request body: Contract-specific parameters (id, name, symbol, etc.)

**Outputs:**
- Success/error responses
- Event arrays for GET /events

**Dependencies:**
- `utils/contract` (registry, publicClient)
- `viem` library

**Interactions:**
- Writes to blockchain contract for registration and trade logging
- Reads contract state for event history

**Problems/Issues:**
- ID type mismatches (UUIDs vs uint256) - conversion logic is inconsistent
- Event reading uses iterative queries (inefficient, max 1000 iterations)
- No pagination for events endpoint
- Contract address must be set or endpoints return 503

---

#### `routes/debates.js`
**Purpose:** Legacy endpoints for discussions (maintained for backward compatibility).

**Endpoints:**
- Same as `routes/discussions.js` but with different parameter names (`debateId` vs `id`)

**Status:** Legacy wrapper - should be deprecated.

**Problems/Issues:**
- Duplicate functionality with `routes/discussions.js`
- Parameter name mapping (`debateId` -> `discussionId`) is confusing

---

### Controllers Layer

#### `controllers/agentsController.js`
**Purpose:** Business logic for agent operations.

**Functions:**
- `getAgents()` - Load all agents

**Dependencies:**
- `utils/agentStorage`

**Status:** Minimal - most logic is in routes or agent classes.

---

#### `controllers/sectorsController.js`
**Purpose:** Business logic for sector operations.

**Functions:**
- `createSector(payload)` - Create new sector with validation
- `getSectors()` - Get all sectors with agents
- `getSectorById(id)` - Get single sector with agents
- `updateSectorPerformance(id)` - Recalculate sector metrics

**Inputs:**
- Sector payload: `{sectorName, sectorSymbol, ...}`

**Outputs:**
- Normalized sector objects

**Dependencies:**
- `models/Sector`
- `utils/storage`
- `utils/agentStorage`
- `agents/pipeline/createAgent`
- `simulation/performance`

**Interactions:**
- Auto-creates manager agent when sector is created
- Associates agents with sectors
- Calculates price, volatility, and risk scores
- Normalizes sector data for consistent API responses

**Problems/Issues:**
- `normalizeSectorRecord()` has extensive fallback logic (suggests data inconsistency)
- Performance update modifies sector in-place (could cause race conditions)
- Agent loading errors are caught but may hide issues

---

### Models Layer

#### `models/Agent.js`
**Purpose:** Agent data model with validation and persistence.

**Properties:**
- `id`, `name`, `role`, `prompt`, `sectorId`, `status`
- `performance` (pnl, winRate), `trades`, `personality`, `preferences`
- `memory`, `lastDecision`, `morale`, `rewardPoints`

**Methods:**
- `toJSON()`, `saveToJSON()`, `static loadAllAgents()`, `static fromData()`

**Dependencies:**
- `crypto` (randomUUID), `fs.promises`, `path`

**Interactions:**
- Persists to `storage/agents.json`
- Used by agent storage utilities

**Problems/Issues:**
- Direct file I/O in model (should use storage layer)
- No validation of sectorId existence
- Default values are frozen objects (good), but mutations possible elsewhere

---

#### `models/Sector.js`
**Purpose:** Sector data model with validation.

**Properties:**
- `id`, `sectorName`, `sectorSymbol`, `currentPrice`, `change`, `changePercent`
- `volume`, `statusPercent`, `activeAgents`, `candleData`, `discussions`, `agents`
- `volatility`, `riskScore`, `balance`

**Methods:**
- `toJSON()`, `static fromData()`

**Dependencies:**
- `uuid` (v4), `utils/priceSimulation`

**Interactions:**
- Used by sector controllers and storage

**Problems/Issues:**
- `fromData()` has fallback logic for name/symbol (data inconsistency)
- Candle data validation but no generation logic in model

---

#### `models/Discussion.js`
**Purpose:** Legacy discussion model (minimal, not actively used).

**Status:** Superseded by `DiscussionRoom` - should be removed or consolidated.

---

#### `models/DiscussionRoom.js`
**Purpose:** Discussion room model with message and decision tracking.

**Properties:**
- `id`, `sectorId`, `title`, `agentIds`, `messages`, `status`
- `finalDecision`, `rationale`, `confidence`, `voteBreakdown`, `conflictScore`

**Methods:**
- `addMessage()`, `setDecision()`, `toJSON()`, `static fromData()`

**Dependencies:**
- `uuid` (v4)

**Interactions:**
- Used by discussion routes and lifecycle
- Stores agent arguments and final decisions

**Problems/Issues:**
- Status mapping in `fromData()` for backward compatibility (legacy status values)
- No validation that agentIds exist

---

### Storage/Utils Layer

#### `utils/storage.js`
**Purpose:** Sector storage operations (CRUD).

**Functions:**
- `loadSectors()`, `saveSectors()`, `getSectorById()`, `updateSector()`

**Dependencies:**
- `utils/persistence`

**Interactions:**
- Reads/writes `storage/sectors.json`
- Used by sector controllers

**Problems/Issues:**
- No transaction support (race conditions possible)
- File-based storage not scalable

---

#### `utils/agentStorage.js`
**Purpose:** Agent storage operations.

**Functions:**
- `loadAgents()`, `saveAgents()`

**Dependencies:**
- `utils/persistence`

**Interactions:**
- Reads/writes `storage/agents.json`
- Used throughout agent system

**Problems/Issues:**
- Same as `utils/storage.js` - no transactions, file-based

---

#### `utils/discussionStorage.js`
**Purpose:** Discussion storage operations.

**Functions:**
- `loadDiscussions()`, `saveDiscussions()`, `findDiscussionById()`, `saveDiscussion()`

**Dependencies:**
- `utils/persistence`

**Interactions:**
- Reads/writes `storage/discussions.json`
- Used by discussion routes and lifecycle

**Problems/Issues:**
- Same storage limitations

---

#### `utils/persistence.js`
**Purpose:** Low-level file persistence with desktop/web mode support.

**Functions:**
- `getDataDir()`, `ensureDataDir()`, `readDataFile()`, `writeDataFile()`

**Inputs:**
- Environment variables: `MAX_ENV`, `MAX_APP_DATA_DIR`

**Outputs:**
- File paths, directory creation, JSON read/write

**Dependencies:**
- `fs.promises`, `path`

**Interactions:**
- Used by all storage utilities
- Supports desktop mode (custom data directory) vs web mode (default storage/)

**Problems/Issues:**
- No file locking (concurrent writes possible)
- No backup/versioning
- Error handling assumes ENOENT means "file doesn't exist" (could be other issues)

---

#### `utils/contract.js`
**Purpose:** Blockchain contract client setup (viem).

**Exports:**
- `registry` (contract instance), `publicClient`, `walletClient`

**Dependencies:**
- `viem`, environment variables: `RPC_URL`, `MAX_REGISTRY`, `PRIVATE_KEY`

**Interactions:**
- Used by routes for blockchain operations
- Contract ABI defines: registerSector, registerAgent, logTrade, validateAction, events

**Problems/Issues:**
- Hardcoded chain ID (31337 - local Hardhat)
- Private key validation is basic (length check only)
- Contract instance is null if `MAX_REGISTRY` not set (many endpoints fail)

---

#### `utils/priceSimulation.js`
**Purpose:** Candle data generation utility.

**Functions:**
- `generateCandles(price)` - Generates 30 random candles

**Dependencies:**
- None (pure function)

**Interactions:**
- Used by Sector model for initial candle data

**Problems/Issues:**
- Random generation (not deterministic)
- Fixed 30 candles (not configurable)

---

### Agents System

#### `agents/runtime/agentRuntime.js`
**Purpose:** Runtime manager for executing manager agents in tick-based loops.

**Class: AgentRuntime**
- Manages manager agent instances
- Runs tick loop at configurable intervals
- Logs decisions and broadcasts signals

**Methods:**
- `initialize()`, `start(intervalMs)`, `stop()`, `tick()`, `reloadAgents()`, `getStatus()`

**Dependencies:**
- `utils/agentStorage`
- `agents/manager/ManagerAgent`

**Interactions:**
- Loads manager agents from storage
- Executes `tick()` on each manager periodically
- Broadcasts signals for high-confidence decisions
- Used by server.js bootstrap and manager routes

**Problems/Issues:**
- Decision log kept in memory (lost on restart)
- No persistence of runtime state
- Reload only adds new agents (doesn't update existing)

---

#### `agents/pipeline/createAgent.js`
**Purpose:** Agent creation pipeline with role inference and personality assignment.

**Functions:**
- `createAgent(promptText, sectorId)`, `inferRole(promptText)`, `getDefaultPersonality(role)`, `getDefaultPreferences(role)`

**Inputs:**
- `promptText` (string) - User prompt for agent creation
- `sectorId` (string|null) - Optional sector assignment

**Outputs:**
- Agent instance with inferred role, personality, preferences

**Dependencies:**
- `agents/base/Agent`
- `utils/agentStorage`, `utils/storage`

**Interactions:**
- Infers role from prompt keywords
- Generates unique agent IDs based on role and sector
- Creates agent and saves to storage
- Updates sector activeAgents count

**Problems/Issues:**
- Role inference is keyword-based (may misclassify)
- ID generation uses string matching (could collide)
- ActiveAgents count only updated if status is 'active' (but new agents default to 'idle')

---

#### `agents/morale.js`
**Purpose:** Agent morale and reward system.

**Functions:**
- `getMorale(agentId)`, `updateMorale(agentId, delta)`, `rewardForProfit()`, `penalizeForLoss()`, `applyConfidenceModifier()`

**Dependencies:**
- `utils/agentStorage`, `models/Agent`

**Interactions:**
- Updates agent morale (0-100) based on performance
- Applies confidence modifiers based on morale
- Tracks reward points

**Problems/Issues:**
- Morale updates are immediate (no rate limiting)
- Confidence modifier thresholds are hardcoded (20, 80)

---

#### `agents/discussion/discussionLifecycle.js`
**Purpose:** Complete discussion lifecycle management (create, collect arguments, vote, decide, close, archive).

**Functions:**
- `startDiscussion()`, `collectArguments()`, `aggregateVotes()`, `produceDecision()`, `closeDiscussion()`, `archiveDiscussion()`, `autoDiscussionLoop()`

**Dependencies:**
- `models/DiscussionRoom`
- `utils/discussionStorage`, `utils/agentStorage`, `utils/storage`
- `manager/voting`, `manager/confidence`, `manager/conflict`
- `agents/research/ResearchAgent`
- `agents/manager/ManagerAgent`

**Interactions:**
- Creates discussion rooms for sectors
- Collects arguments from sector agents (uses ResearchAgent for research agents)
- Aggregates votes and produces decisions
- Auto-loop checks sectors and manages discussion lifecycle
- Integrates with voting, confidence, and conflict resolution

**Problems/Issues:**
- Auto-loop runs every 15s (hardcoded)
- Signal generation for non-research agents is placeholder logic
- Discussion creation triggers based on balance > 0 (may create too many)
- No rate limiting on discussion creation

---

#### `agents/base/Agent.js`
**Purpose:** Legacy shim - redirects to `models/Agent.js`.

**Status:** Should be removed or consolidated.

---

#### `agents/base/BaseAgent.js`
**Purpose:** Base agent class with memory and reasoning (referenced but not read in analysis).

**Note:** Referenced by `agents/manager/ManagerAgent.js` but file not analyzed.

---

#### `agents/ExecutionAgent.js`
**Purpose:** Executes final decisions from ManagerAgent.

**Class: ExecutionAgent**
- Validates decisions
- Executes trades via SimulationEngine
- Logs trades to blockchain

**Methods:**
- `execute(decision, options)`, `calculateQuantity(confidence)`, `logTradeToContract()`, `logExecution()`, `getExecutionLogs()`

**Dependencies:**
- `simulation/rules` (validateTrade)
- `simulation/SimulationEngine`
- `utils/contract` (registry)
- `utils/persistence`

**Interactions:**
- Validates trades with rules engine
- Executes via SimulationEngine's ExecutionEngine
- Logs to blockchain contract
- Stores execution logs in JSON file

**Problems/Issues:**
- Quantity calculation is simple (confidence-based, 100-10000 range)
- Contract logging failures don't fail execution (may cause inconsistency)
- Execution logs stored in file (not scalable)

---

#### `agents/ManagerAgent.js` (legacy)
**Purpose:** Legacy manager agent for decision-making (simple version).

**Class: ManagerAgent**
- Basic decision-making from agent signals
- Voting, confidence aggregation, conflict resolution

**Dependencies:**
- `manager/voting`, `manager/confidence`, `manager/conflict`
- `utils/agentStorage`

**Status:** Still used by some routes, but superseded by `agents/manager/ManagerAgent.js`.

**Problems/Issues:**
- No memory or state persistence
- No tick loop integration
- Simpler than new ManagerAgent

---

#### `agents/manager/ManagerAgent.js`
**Purpose:** Full-featured manager agent with memory, tick loop, and cross-sector communication.

**Class: ManagerAgent extends BaseAgent**
- Decision-making with memory
- Tick-based decision loops
- Cross-sector signal broadcasting
- Morale evaluation and updates

**Methods:**
- `decide()`, `tick()`, `evaluatePreviousDecision()`, `broadcast()`, `persistMemoryAndDecision()`

**Dependencies:**
- `agents/base/BaseAgent`
- `manager/voting`, `manager/confidence`, `manager/conflict`
- `utils/agentStorage`, `utils/storage`
- `agents/comms/MessageBus`
- `agents/morale`
- `agents/research`

**Interactions:**
- Loads sector data and agents
- Collects signals from sector agents (uses ResearchAgent for research agents)
- Makes decisions via voting/confidence/conflict resolution
- Evaluates previous decisions and updates morale
- Broadcasts signals to other managers
- Persists memory and decisions to storage

**Problems/Issues:**
- Complex signal collection logic (duplicated in some places)
- Morale evaluation based on price change (simplified)
- Memory persistence happens on every decision (could batch)

---

### Manager Decision Modules

#### `manager/voting.js`
**Purpose:** Majority voting logic for agent signals.

**Functions:**
- `vote(signals)`, `countVotes()`, `getMajorityAction()`

**Inputs:**
- Array of signals: `[{action, confidence, agentId?}]`

**Outputs:**
- Voting result: `{action, votes, confidenceSums}`

**Dependencies:**
- None (pure functions)

**Interactions:**
- Used by ManagerAgent and discussion lifecycle

**Problems/Issues:**
- Tie-breaking uses confidence sum (may not be optimal)
- Only handles BUY/SELL/HOLD (no other actions)

---

#### `manager/confidence.js`
**Purpose:** Confidence aggregation using weighted averages.

**Functions:**
- `aggregateConfidence()`, `aggregateConfidenceForAction()`, `calculateWeight()`

**Inputs:**
- Signals array, optional agentWinRates map

**Outputs:**
- Aggregated confidence (0-1)

**Dependencies:**
- None (pure functions)

**Interactions:**
- Used by ManagerAgent and discussion lifecycle
- Weights confidence by agent win rates

**Problems/Issues:**
- Weight calculation is linear (0.5-2.0 range) - may not be optimal
- No handling for agents with no win rate data

---

#### `manager/conflict.js`
**Purpose:** Conflict detection and resolution.

**Functions:**
- `detectConflict()`, `resolveConflict()`, `calculateConflictScore()`, `groupByAction()`

**Inputs:**
- Signals array, conflictThreshold (0-1)

**Outputs:**
- Conflict result: `{hasConflict, conflictScore, needsReview, voteCounts}`
- Resolved action (string)

**Dependencies:**
- None (pure functions)

**Interactions:**
- Used by ManagerAgent and discussion lifecycle
- Detects conflicts using entropy-based scoring
- Resolves conflicts using highest win-rate cluster

**Problems/Issues:**
- Conflict threshold is configurable but default (0.5) may not be optimal
- Resolution falls back to majority vote if no win rates (may not be best)

---

### Simulation System

#### `simulation/SimulationEngine.js`
**Purpose:** Main simulation engine coordinating orderbook, price simulation, and execution.

**Class: SimulationEngine**
- Manages sector simulation state
- Coordinates price generation, trade execution, cross-signals

**Methods:**
- `initializeSector()`, `simulateTick()`, `updateSectorData()`, `getSectorState()`, `initializeAllSectors()`

**Dependencies:**
- `simulation/orderbook`, `simulation/priceSimulator`, `simulation/execution`, `simulation/crossSignals`
- `utils/storage`

**Interactions:**
- Initializes sectors with orderbook, price simulator, execution engine
- Runs simulation ticks (price generation, trade execution, sector updates)
- Updates sector storage with new prices and metrics
- Processes cross-signals between sectors

**Problems/Issues:**
- Sector state kept in memory (lost on restart)
- No persistence of simulation state
- Cross-signal processing is logged but not fully utilized

---

#### `simulation/execution.js`
**Purpose:** Trade execution engine with validation.

**Class: ExecutionEngine extends EventEmitter**
- Validates trades
- Executes via orderbook
- Emits trade events

**Methods:**
- `executeDecision(decision)`, `getStatus()`

**Dependencies:**
- `simulation/rules` (validateTrade, checkRiskAppetite)
- `simulation/orderbook`

**Interactions:**
- Validates trades with rules engine
- Adds orders to orderbook
- Emits `simulated_trade` and `trade_rejected` events

**Problems/Issues:**
- Event emission but no clear listeners (except SimulationEngine)
- Risk appetite check may reject valid trades

---

#### `simulation/orderbook.js`
**Purpose:** Orderbook with limit/market order matching.

**Classes: Order, Trade, Orderbook**
- Bid/ask order management
- Order matching algorithm
- Trade history tracking

**Methods:**
- `addOrder()`, `matchOrders()`, `getTradeHistory()`, `getSummary()`

**Dependencies:**
- `uuid` (v4)

**Interactions:**
- Used by ExecutionEngine for trade execution
- Maintains order book state and trade history

**Problems/Issues:**
- Order matching is immediate (no time-based matching)
- No order cancellation timeout
- Trade history grows unbounded (should have limits)

---

#### `simulation/priceSimulator.js`
**Purpose:** Price simulation using Geometric Brownian Motion.

**Class: PriceSimulator**
- Generates stochastic price movements
- Calculates risk scores

**Methods:**
- `generateNextPrice()`, `calculateRiskScore()`, `setVolatility()`, `getPrice()`

**Dependencies:**
- None (pure math)

**Interactions:**
- Used by SimulationEngine for price generation
- Risk score calculation based on price history

**Problems/Issues:**
- GBM parameters (drift, volatility) are fixed per sector
- Risk score calculation requires price history (may be empty initially)

---

#### `simulation/performance.js`
**Purpose:** Sector performance calculations (price, volatility, risk).

**Functions:**
- `calculatePrice()`, `applyVolatility()`, `computeRiskScore()`

**Dependencies:**
- None (pure functions)

**Interactions:**
- Used by sector controller for performance updates
- Calculates metrics from sector data

**Problems/Issues:**
- Price calculation duplicates PriceSimulator logic
- Volatility calculation from candle data (may be inconsistent format)

---

#### `simulation/rules.js`
**Purpose:** Trade validation rules (referenced but not read in analysis).

**Note:** Used by ExecutionEngine and ExecutionAgent but file not analyzed.

---

#### `simulation/crossSignals.js`
**Purpose:** Cross-sector signal propagation (referenced but not read in analysis).

**Note:** Used by SimulationEngine but file not analyzed.

---

## System-Wide Issues and Inconsistencies

### 1. **ID Type Mismatches**
- Agents and sectors use UUIDs in storage
- Blockchain contract expects uint256
- Conversion logic is inconsistent (`uuidToUint`, `parseInt`, `hashStringToNumber`)
- Some routes use `parseInt()` which fails for UUIDs

### 2. **Dual ManagerAgent Classes**
- `agents/ManagerAgent.js` (legacy, simple)
- `agents/manager/ManagerAgent.js` (new, full-featured)
- Routes use both inconsistently
- Should consolidate or clearly separate use cases

### 3. **Storage Architecture**
- All storage is file-based JSON (not scalable)
- No transactions or locking (race conditions possible)
- No backup or versioning
- Desktop vs web mode handled, but file I/O is blocking

### 4. **State Persistence**
- AgentRuntime decision log is in-memory only
- SimulationEngine sector state is in-memory only
- ManagerAgent memory is persisted, but runtime state is not
- System state lost on restart

### 5. **Error Handling**
- Many operations catch errors but continue (permissive)
- Chain registration failures are silently ignored
- Storage errors may be hidden by fallback logic

### 6. **Configuration**
- Hardcoded intervals (3s, 15s)
- Hardcoded thresholds (conflict 0.5, morale 20/80)
- Chain ID hardcoded (31337)
- Should use environment variables or config file

### 7. **Testing/Mocking**
- Mock signal generation in manager routes (not clearly marked)
- Placeholder logic in discussion lifecycle
- Should have clear test vs production modes

### 8. **Legacy Code**
- `routes/debates.js` duplicates `routes/discussions.js`
- `models/Discussion.js` superseded by `DiscussionRoom`
- `agents/base/Agent.js` is just a shim
- `index.js` is placeholder

### 9. **Data Consistency**
- Sector normalization has extensive fallback logic
- Agent ID generation could collide
- Status values mapped for backward compatibility
- Suggests data format changes over time

### 10. **Performance**
- No caching of frequently accessed data (agents, sectors)
- Enrichment happens on every request
- Event reading uses iterative queries (inefficient)
- File I/O is blocking (should use async properly)

---

## Backend Folder Responsibility Summary

The backend folder is responsible for:

1. **API Server**: Fastify-based HTTP API with REST endpoints for all system operations
2. **Agent Management**: Creation, storage, and runtime execution of trading agents
3. **Sector Management**: Financial sector creation, balance management, and performance tracking
4. **Discussion System**: Multi-agent discussion rooms for collaborative decision-making
5. **Decision-Making**: Voting, confidence aggregation, and conflict resolution for agent signals
6. **Trade Execution**: Validation, orderbook management, and trade execution
7. **Price Simulation**: Stochastic price generation using Geometric Brownian Motion
8. **Blockchain Integration**: On-chain registration and trade logging via smart contracts
9. **Storage Layer**: File-based persistence with desktop/web mode support
10. **Background Services**: Tick-based loops for agent runtime and discussion lifecycle

The system coordinates multiple autonomous agents that make trading decisions, discuss strategies, vote on actions, and execute trades in simulated financial markets, with optional blockchain integration for transparency and auditability.


