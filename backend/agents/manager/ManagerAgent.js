// ManagerAgent.js - Base class stub

const { loadDebates, saveDebate } = require('../../utils/debateStorage');
const DebateRoom = require('../../models/DebateRoom');
const Discussion = require('../../models/Discussion');
const { processDecisionResult, applyMoraleConfidenceModifier } = require('../AgentEngine');

const personalityStyles = ['aggressive', 'balanced', 'conservative'];
const riskLevels = ['low', 'medium', 'high'];

function applyPersonalityDefaults(agent) {
  if (!agent) {
    return agent;
  }

  const hasRisk = agent.personality && agent.personality.riskTolerance;
  const hasDecision = agent.personality && agent.personality.decisionStyle;

  if (hasRisk && hasDecision) {
    return agent;
  }

  const updated = { ...agent };
  updated.personality = {
    riskTolerance: hasRisk ? agent.personality.riskTolerance : riskLevels[Math.floor(Math.random() * riskLevels.length)],
    decisionStyle: hasDecision ? agent.personality.decisionStyle : personalityStyles[Math.floor(Math.random() * personalityStyles.length)]
  };

  return updated;
}

class ManagerAgent {
  constructor(sectorId) {
    this.sectorId = sectorId;
    this.agents = [];
    this.debates = [];
    this.discussions = [];
    this.state = {};
  }

  async loadState() {
    // Load all debates from debatesStorage
    const allDebates = await loadDebates();
    
    // Filter by this.sectorId and convert to DebateRoom instances
    this.debates = allDebates
      .filter(debate => debate.sectorId === this.sectorId)
      .map(debate => DebateRoom.fromData(debate));

    // Convert debates to discussion objects for UI consumption
    this.discussions = this.debates
      .map(debate => this.createDiscussionFromDebate(debate))
      .filter(Boolean);
  }

  saveState() {
    // Future hook for saving state
    // For now, debates are saved individually via saveDebate() in openDebate()
    // This method can be extended to save aggregated state if needed
  }

  async openDebate(title, agentIds) {
    // Create a new DebateRoom for this.sectorId
    const debate = new DebateRoom(this.sectorId, title, agentIds);
    
    // Save it via debatesStorage
    await saveDebate(debate);
    
    // Add to this.debates
    this.debates.push(debate);
    
    // Return the new debate
    return debate;
  }

  addAgent(agent) {
    const enrichedAgent = applyPersonalityDefaults(agent);
    this.agents.push(enrichedAgent);
    return enrichedAgent;
  }

  removeAgent(agentId) {
    // Empty stub
  }

  decisionLoop() {
    // Empty stub - placeholder
    // When implementing, use processDecisionResult() from AgentEngine
    // to update morale based on decision outcomes
  }

  /**
   * Process agent decision with morale integration
   * This method should be called when an agent makes a decision that affects sector profit/loss
   * @param {string} agentId - Agent ID
   * @param {number} baseConfidence - Base confidence from decision model (0-1)
   * @param {number} profitLoss - Profit (positive) or loss (negative) from decision
   * @returns {Promise<{confidence: number, morale: number, status: string}>} Decision result with morale modifiers
   */
  async processAgentDecision(agentId, baseConfidence, profitLoss) {
    // Apply morale-based confidence modifier
    const modifiedConfidence = await applyMoraleConfidenceModifier(agentId, baseConfidence);
    
    // Update morale based on decision outcome
    const moraleResult = await processDecisionResult(agentId, profitLoss);
    
    return {
      confidence: modifiedConfidence,
      morale: moraleResult.morale,
      status: moraleResult.status,
      confidenceModifier: moraleResult.confidenceModifier
    };
  }

  crossSectorComms() {
    // Empty stub - placeholder
  }

  createDiscussionFromDebate(debate) {
    if (!debate) {
      return null;
    }

    const logs = debate.logs || debate.messages || [];
    return new Discussion({
      id: `disc-${debate.id}`,
      sectorId: debate.sectorId,
      status: debate.status || 'active',
      timestamp: Date.now(),
      participants: Array.isArray(debate.agentIds) ? debate.agentIds : [],
      messages: logs.map(log => ({
        sender: log.agentId || log.sender,
        content: log.message || log.content || '',
        timestamp: log.timestamp || log.createdAt || Date.now()
      }))
    });
  }

  recordDiscussionFromDebate(debate, sector) {
    const discussion = this.createDiscussionFromDebate(debate);

    if (discussion) {
      this.discussions.push(discussion);
      if (sector) {
        if (!Array.isArray(sector.discussions)) {
          sector.discussions = [];
        }
        // Attach discussion to the sector for UI consumption
        sector.discussions.push(discussion);
      }
    }

    return discussion;
  }

  getDebateSummary() {
    // Count debates by status for this.sectorId
    const statusCounts = {};
    let lastUpdated = null;
    const debatingIds = [];

    this.debates.forEach(debate => {
      // Count by status
      statusCounts[debate.status] = (statusCounts[debate.status] || 0) + 1;
      
      // Track last updated timestamp
      if (debate.updatedAt) {
        const updatedAt = new Date(debate.updatedAt).getTime();
        if (!lastUpdated || updatedAt > lastUpdated) {
          lastUpdated = updatedAt;
        }
      }
      
      // Track currently "debating" debates
      if (debate.status === 'debating') {
        debatingIds.push(debate.id);
      }
    });

    return {
      statusCounts,
      lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : null,
      debatingIds
    };
  }

  getSummary() {
    return {
      sectorId: this.sectorId,
      agentCount: this.agents.length,
      debateSummary: this.getDebateSummary()
    };
  }
}

module.exports = ManagerAgent;

