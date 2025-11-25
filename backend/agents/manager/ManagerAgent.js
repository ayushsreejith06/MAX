// ManagerAgent.js - Base class stub

const { loadDebates, saveDebate } = require('../../storage/debatesStorage');
const { saveDebates } = require('../../utils/debateStorage');
const DebateRoom = require('../../models/DebateRoom');

class ManagerAgent {
  constructor(sectorId) {
    this.sectorId = sectorId;
    this.agents = [];
    this.debates = [];
    this.state = {};
  }

  async loadState() {
    // Load all debates from debatesStorage
    const allDebates = await loadDebates();
    
    // Filter by this.sectorId and convert to DebateRoom instances
    this.debates = allDebates
      .filter(debate => debate.sectorId === this.sectorId)
      .map(debate => DebateRoom.fromData(debate));
  }

  saveState() {
    // Future hook for saving state
    // For now, debates are saved individually via saveDebate() in openDebate()
    // This method can be extended to save aggregated state if needed
  }

  async openDebate(title, agentIds) {
    // Create a new DebateRoom for this.sectorId
    const debate = new DebateRoom({
      sectorId: this.sectorId,
      title,
      agentIds
    });
    
    // Save it via debatesStorage
    await saveDebate(debate);
    
    // Add to this.debates
    this.debates.push(debate);
    
    // Return the new debate
    return debate;
  }

  addAgent(agentId) {
    // Add agent ID if not already present
    if (!this.agents.includes(agentId)) {
      this.agents.push(agentId);
    }
  }

  removeAgent(agentId) {
    // Remove agent ID if present
    const index = this.agents.indexOf(agentId);
    if (index !== -1) {
      this.agents.splice(index, 1);
    }
  }

  async decisionLoop() {
    // Ensure we have the latest debates loaded
    await this.loadState();

    // Filter to active debates (open or debating status)
    const activeDebates = this.debates.filter(
      debate => debate.status === 'open' || debate.status === 'debating'
    );

    // If there is no active debate, return silently
    if (activeDebates.length === 0) {
      return;
    }

    const now = Date.now();
    const THREE_MINUTES_MS = 3 * 60 * 1000;
    let hasChanges = false;

    // Process each active debate
    for (const debate of activeDebates) {
      let shouldClose = false;

      // Check if debate is stuck in "open" > 3 minutes
      if (debate.status === 'open') {
        const openedAt = new Date(debate.updatedAt || debate.createdAt).getTime();
        const timeSinceOpened = now - openedAt;
        
        if (timeSinceOpened > THREE_MINUTES_MS) {
          shouldClose = true;
        }
      }

      // Check if all agents have submitted messages
      if (!shouldClose && debate.agentIds && debate.agentIds.length > 0) {
        const agentIdsWithMessages = new Set(
          debate.messages.map(msg => msg.agentId)
        );
        const allAgentsSubmitted = debate.agentIds.every(
          agentId => agentIdsWithMessages.has(agentId)
        );
        
        if (allAgentsSubmitted) {
          shouldClose = true;
        }
      }

      // Close the debate if needed
      if (shouldClose) {
        debate.status = 'closed';
        debate.updatedAt = new Date().toISOString();
        hasChanges = true;
      }
    }

    // Save changes if any debates were closed
    if (hasChanges) {
      const allDebates = await loadDebates();
      
      // Update the debates in the allDebates array
      for (let i = 0; i < allDebates.length; i++) {
        const updatedDebate = this.debates.find(d => d.id === allDebates[i].id);
        if (updatedDebate && updatedDebate.status === 'closed') {
          allDebates[i] = updatedDebate.toJSON();
        }
      }
      
      await saveDebates(allDebates);
    }
  }

  crossSectorComms(externalSectorSummaries = []) {
    // Get local sector state
    const localSummary = this.getDebateSummary();
    const localActiveDebates = localSummary.debatingIds.length;
    
    // Calculate risk level by comparing with other sectors
    let riskLevel = 'low';
    
    if (externalSectorSummaries.length > 0) {
      // Calculate average active debates across external sectors
      const externalActiveDebates = externalSectorSummaries.map(summary => {
        return summary.debateSummary?.debatingIds?.length || 0;
      });
      
      const avgExternalActive = externalActiveDebates.reduce((sum, count) => sum + count, 0) / externalActiveDebates.length;
      
      // Compare local with average
      if (localActiveDebates > avgExternalActive * 1.5) {
        riskLevel = 'high';
      } else if (localActiveDebates > avgExternalActive) {
        riskLevel = 'medium';
      }
    }
    
    // Return lightweight signal object
    return {
      sectorId: this.sectorId,
      riskLevel: riskLevel,
      lastUpdated: localSummary.lastUpdated || new Date().toISOString(),
      activeDebates: localActiveDebates
    };
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

