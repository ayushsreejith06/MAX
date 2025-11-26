// ManagerAgent.js - Base class stub

const { loadDebates, saveDebates } = require('../../utils/debateStorage');
const DebateRoom = require('../../models/DebateRoom');

class ManagerAgent {
  constructor(sectorId) {
    this.sectorId = sectorId;
    this.agents = [];
    this.debates = [];
    this.state = {};
  }

  async loadState() {
    // Load all debates from debateStorage
    const allDebates = await loadDebates();
    
    // Filter by this.sectorId and convert to DebateRoom instances
    this.debates = allDebates
      .filter(debate => debate.sectorId === this.sectorId)
      .map(debate => DebateRoom.fromData(debate));
  }

  saveState() {
    // Future hook for saving state
    // For now, debates are saved individually via saveDebates() in openDebate()
    // This method can be extended to save aggregated state if needed
  }

  async openDebate(title, agentIds) {
    // Create a new DebateRoom for this.sectorId
    const debate = new DebateRoom(this.sectorId, title, agentIds);
    
    // Load all debates, add the new one, and save
    const allDebates = await loadDebates();
    allDebates.push(debate.toJSON());
    await saveDebates(allDebates);
    
    // Add to this.debates
    this.debates.push(debate);
    
    // Return the new debate
    return debate;
  }

  addAgent(agentId) {
    // Empty stub
  }

  removeAgent(agentId) {
    // Empty stub
  }

  decisionLoop() {
    // Empty stub - placeholder
  }

  crossSectorComms() {
    // Empty stub - placeholder
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

