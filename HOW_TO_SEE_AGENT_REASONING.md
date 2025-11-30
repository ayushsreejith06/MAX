# How to See Agent Reasoning Working

## The Problem
Manager agents need **other agents** (traders, analysts, etc.) in the same sector to provide signals. Without them, the manager will just return "HOLD" with no reasoning.

## Solution: Create Multiple Agents

### Step 1: Create a Manager Agent
1. Go to a sector detail page
2. Click "Create Agent"
3. Use prompt: `manage coordinate oversee supervise`
4. This creates the manager (already done!)

### Step 2: Create Other Agents (Traders, Analysts, etc.)
**You need at least 2-3 other agents for the manager to have signals to work with.**

Create agents with these prompts:

**Trader Agents:**
- `trade buy sell market execute`
- `trading position entry exit`
- `buy sell order market`

**Analyst Agents:**
- `analyze research forecast predict`
- `analysis report data model`
- `research investigate examine`

**Advisor Agents:**
- `advise recommend suggest consult`

### Step 3: Wait for Decisions
- Manager agents tick every **3 seconds**
- They collect signals from all non-manager agents in the sector
- They make decisions based on majority voting
- Decisions appear in the "MANAGER AGENT" section

## What You'll See

Once you have multiple agents:

1. **In the "MANAGER AGENT" section:**
   - Latest decision with reasoning like:
     - "Majority vote: 2 agents voted BUY"
     - "High conflict detected (score: 0.75). Manual review required."
   - Vote breakdown showing BUY/SELL/HOLD counts
   - Confidence scores
   - Recent decisions list

2. **In terminal logs:**
   ```
   [AgentRuntime] Executing tick for all managers...
   [ManagerAgent ...] Decision: BUY (confidence: 0.65)
   ```

## Quick Test Setup

1. Create a sector (if you don't have one)
2. Create 1 manager agent: `manage coordinate oversee`
3. Create 3 trader agents: 
   - `trade buy sell`
   - `trading market execute`
   - `buy sell order`
4. Wait 5-10 seconds
5. Check the "MANAGER AGENT" section - you should see decisions!

## Why This Happens

The manager agent's job is to:
1. Collect signals from all agents in the sector
2. Vote on what action to take (BUY/SELL/HOLD)
3. Detect conflicts between agents
4. Make a final decision based on majority + confidence

Without other agents, there are no signals to vote on, so it defaults to HOLD.

