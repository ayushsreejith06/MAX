# MAX — Multi-Agent eXecution System (Overview)
MAX is a multi-agent investment system built around Sectors.  
Each Sector contains a Manager Agent and up to 4 user-defined Custom Agents.
---
## 1. Sector Creation
- User creates a Sector using natural-language prompts:
  - Sector name (1–2 words)
  - Short description of sector goals
- After creation:
  - The system automatically creates **one Manager Agent**
  - The user can create **up to 4 Custom Agents** via natural language prompts

---

## 2. Agent Behavior
All agents (Manager + Custom):
- Run continuously as long as the Sector is active
- Maintain a **confidence interval** between **-100 and +100**
- Update their confidence dynamically using their own logic:
  - Research agents → news, sentiment, trends
  - Analyst agents → market data, price signals
  - Other custom agents → user-defined logic

The Manager Agent continually monitors these confidence values.

---

## 3. Discussion Trigger
A Discussion automatically begins when:
- **All custom agents have confidence ≥ +65**

This signals that all agents believe they have positive contributions to make.

---

## 4. Discussion Workflow
Once triggered:
1. **All agents present structured ideas** to the discussion  
2. Agents read each other’s messages and revise their proposals  
3. Agents collaborate to form a **Checklist of proposed actions**  
4. The Checklist is sent to the Manager for review

Checklist items may include:
- Buy actions
- Sell actions
- Adjust allocations
- Set risk controls
- Any custom investment action

---

## 5. Manager Review
The Manager Agent:
- Reviews each checklist item
- Approves or rejects each one
- Sends rejected items back to the discussion with feedback
- Agents refine or drop rejected ideas
- Discussion ends when:
  - All items are approved or dropped
  - All agents agree (consensus)

---

## 6. Execution & Sector Updates
For each **approved** action:
- The Manager Agent executes the action
- Execution affects the Sector’s simulated performance continuously
  - Trades
  - P&L calculations
  - Position updates
  - Agent performance scoring

Some actions may require **user confirmation** (large trades, real-money mode).

---

## 7. Loop / System Cycle
Once a discussion is closed:
- Agents return to independent work
- They continue updating confidence
- When all reach ≥65 again:
  → A new discussion begins  
  → Checklist → Manager review → Execution  
  → Sector updates  
  → Repeat

This creates a continuous multi-agent decision loop.

