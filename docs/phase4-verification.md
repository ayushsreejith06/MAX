# PHASE 4 — SMART CONTRACT + MNEE INTEGRATION VERIFICATION  

**Status:** ⬜ Pending  

**Verification Type:** On-Chain Integration & End-to-End Sync  

**Date:** 2025-11-28



---



# 🔐 GLOBAL SAFETY RULES (MANDATORY)



Before ANY verification step:

1. `git fetch origin main`

2. `git pull origin main`

3. Confirm you are on the **main branch**

4. All fixes must be **atomic commits**:

   - One function fix → one commit  

   - One file change → one commit  

   - Do NOT batch unrelated changes  

5. If conflicts occur → STOP and ask user.



---



# 🎯 OVERALL OBJECTIVE



Ensure that MAX's **backend + contract + frontend** are fully connected:



### The system must now:

- Register sectors on-chain  

- Register agents on-chain  

- Log trades on-chain  

- Validate actions via contract  

- Expose MNEE actions via backend API  

- Frontend fetches through backend → contract connection  

- No mock or placeholder calls remain  



This is a *smart contract integration* verification.



---



# ✅ SECTION 1 — CONTRACT VERIFICATION (Solidity)



### 1.1 Contract Exists

Check:

- [ ] `contracts/MaxRegistry.sol` exists  

- [ ] There is exactly **one** version of the file



If missing → FIX & commit:

```
fix: create MaxRegistry.sol
```



---



### 1.2 Contract Structure

Verify in `MaxRegistry.sol`:

- [ ] `Sector` struct exists  

- [ ] `Agent` struct exists  

- [ ] `Trade` struct exists  

- [ ] Mappings for sectors, agents, trades exist  

- [ ] Auto-increment counters exist  



If missing → FIX & commit:

```
fix: add required structs and mappings
```



---



### 1.3 Methods

Confirm **all required functions** exist:



#### Sector

- [ ] `registerSector(uint256,string,string)`



#### Agent

- [ ] `registerAgent(uint256,uint256,string)`



#### Trade

- [ ] `logTrade(uint256,uint256,uint256,string,uint256)`



#### Validation

- [ ] `validateAction(uint256,uint256,string,uint256)` returns `bool`



If missing → FIX & commit:

```
fix: implement required Phase 4 contract methods
```



---



### 1.4 Events

Verify event declarations:

- [ ] `SectorRegistered`

- [ ] `AgentRegistered`

- [ ] `TradeLogged`



If missing → FIX & commit.



---



### 1.5 Contract Compiles

Run:

```bash
npx hardhat compile
```



Output must show:

- [ ] No errors

- [ ] No warnings that break ABI



If failing → FIX & commit.



---



# ✅ SECTION 2 — CONTRACT DEPLOYMENT VERIFICATION



### 2.1 Hardhat Project Structure

Check in `/contracts`:

- [ ] `hardhat.config.js`

- [ ] `scripts/deploy.js`

- [ ] `/artifacts` appears after compilation



If missing → FIX & commit.



---



### 2.2 Deployment

Run:

```bash
npx hardhat run scripts/deploy.js --network hardhat
```



Verify:

- [ ] Contract address printed  

- [ ] Address stored in `.env` as `MAX_REGISTRY=`  



If not updated → FIX & commit:

```
chore: update MAX_REGISTRY environment variable
```



---



# ✅ SECTION 3 — BACKEND CONTRACT CONNECTOR



### 3.1 File Exists

Check:

- [ ] `backend/utils/contract.js` exists



If missing → FIX.



---



### 3.2 Connector Format

Verify inside `contract.js`:

- [ ] ABI uses parseAbi  

- [ ] `createPublicClient` is configured  

- [ ] Contract uses `getContract()`  

- [ ] Reads and writes are namespaced:

```javascript
registry.read.<method>()
registry.write.<method>()
```



If incorrect → FIX & commit:

```
fix: correct viem contract connector
```



---



### 3.3 .env Variables

Ensure:

- [ ] `.env` contains MAX_REGISTRY  

- [ ] Backend loads `.env` before Fastify starts  



If missing → FIX.



---



# ✅ SECTION 4 — BACKEND MNEE ROUTES



### 4.1 Route Exists

Check:

- [ ] `backend/routes/mnee.js` exists



---



### 4.2 Endpoints Exist and Match Spec

Verify each:



#### POST /api/mnee/register-sector

- [ ] Calls `registry.write.registerSector()`



#### POST /api/mnee/register-agent

- [ ] Calls `registry.write.registerAgent()`



#### POST /api/mnee/log-trade

- [ ] Calls `registry.write.logTrade()`



#### POST /api/mnee/validate

- [ ] Calls `registry.read.validateAction()`



If ANY route:

- missing  

- not prefixed with `/api`  

- not registered in `server.js`  



→ FIX & commit:

```
fix: register MNEE contract routes under /api prefix
```



---



# ✅ SECTION 5 — BACKEND AUTO-SYNC HOOKS



### 5.1 Sector Sync

Inside:

`backend/routes/sectors.js` POST handler



Check:

- [ ] After creating sector, backend calls registerSector()



---



### 5.2 Agent Sync

Inside:

`backend/routes/agents.js` POST handler



Check:

- [ ] After creating agent, backend calls registerAgent()



If missing → FIX & commit:

```
fix: enable auto-sync for sector/agent creation
```



---



# ✅ SECTION 6 — FRONTEND MNEE HOOKS



### 6.1 File Exists

Check:

- [ ] `frontend/lib/mnee.ts`



---



### 6.2 Hook Functions

Verify ALL exist:

- [ ] `registerSectorOnChain`

- [ ] `registerAgentOnChain`

- [ ] `logTradeOnChain`

- [ ] `validateActionOnChain`



Each must:

- send POST requests  

- include JSON body  

- call backend endpoints ONLY (not contract directly)



If incorrect → FIX & commit.



---



# ✅ SECTION 7 — END-TO-END WORKFLOW TEST



### 7.1 Create Sector

Test UI or API:

- Create sector

- Confirm:

  - [ ] Added to storage

  - [ ] Appears in `/api/sectors`

  - [ ] Appears on-chain:

    - via Hardhat console OR viem call



If not → FIX & commit:

```
fix: sector creation sync to chain
```



---



### 7.2 Create Agent

- [ ] Appears in `/api/agents`

- [ ] Appears on-chain via registry.agents()



If not → FIX.



---



### 7.3 Simulated Trade

Call:

`POST /api/mnee/log-trade`



Verify:

- [ ] Trade stored on-chain

- [ ] backend returns `{ success: true }`



If not → FIX.



---



### 7.4 Validate Action

- [ ] validate endpoint returns `{ valid: true }`



If not → FIX.



---



# 🧪 SECTION 8 — OPTIONAL STRESS TESTS



### 8.1 Create 10 sectors rapidly

All must:

- [ ] Save to backend  

- [ ] Save to chain  

- [ ] Appear in frontend  



---



### 8.2 Create 10 agents rapidly

All must sync.



---



# 🟩 FINAL RESULT CHECKLIST



Mark ALL as verified:



### Contract

- [ ] Structs  

- [ ] Events  

- [ ] Methods  

- [ ] Deployment  



### Backend

- [ ] Contract connector  

- [ ] MNEE routes  

- [ ] Auto-sync  



### Frontend

- [ ] mnee.ts hooks  

- [ ] API integrations  



### End-to-End

- [ ] Sector appears on-chain & in UI  

- [ ] Agent appears on-chain & in UI  

- [ ] Trade logs on-chain  

- [ ] validateAction works  



---



# 🎉 IF EVERYTHING PASSES

Commit:

```
chore: Phase 4 MNEE integration verified
```



# ❌ IF ANYTHING FAILS

STOP.  

Fix only that part.  

Commit atomically.



---



# END OF PHASE 4 VERIFICATION PROMPT

