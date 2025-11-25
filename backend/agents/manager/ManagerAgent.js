// backend/agents/manager/ManagerAgent.js

const DebateRoom = require("../../models/DebateRoom");
const {
  loadDebates,
  findDebateById,
  saveDebate,
} = require("../../utils/debateStorage");

class ManagerAgent {
  constructor(sectorId) {
    this.sectorId = sectorId;
    this.agents = [];
    this.debates = [];
    this.state = {};

    // 🔥 DEBUG: ensures we know this file is actually being loaded
    console.log(">>> ManagerAgent.js loaded (patched version)");
  }

  async loadState() {
    try {
      const allDebates = await loadDebates();
      const filtered = allDebates.filter((d) => d.sectorId === this.sectorId);

      this.debates = filtered.map((d) => new DebateRoom(d));
    } catch (err) {
      console.error("Error loading ManagerAgent state:", err);
    }
  }

  async saveState() {
    // Future capability
  }

  addAgent(agentId) {
    if (!this.agents.includes(agentId)) {
      this.agents.push(agentId);
    }
  }

  removeAgent(agentId) {
    this.agents = this.agents.filter((id) => id !== agentId);
  }

  async openDebate(title, agentIds = []) {
    const debate = new DebateRoom({
      title,
      sectorId: this.sectorId,
      agentIds,
    });

    await saveDebate(debate);
    this.debates.push(debate);

    return debate;
  }

  async decisionLoop() {
    // Phase 3+
  }

  async crossSectorComms() {
    // Phase 3+
  }

  getDebateSummary() {
    // 🔥 ALWAYS include all 4 statuses
    const statusCounts = {
      created: 0,
      debating: 0,
      closed: 0,
      archived: 0,
    };

    let lastUpdated = null;
    const debatingIds = [];

    for (const d of this.debates) {
      const status = d.status || "created";

      // Ensure unexpected statuses don’t break code
      if (statusCounts[status] === undefined) {
        statusCounts[status] = 0;
      }

      statusCounts[status]++;

      if (status === "debating") {
        debatingIds.push(d.id);
      }

      if (!lastUpdated || new Date(d.updatedAt) > new Date(lastUpdated)) {
        lastUpdated = d.updatedAt;
      }
    }

    return {
      statusCounts,
      lastUpdated,
      debatingIds,
    };
  }

  getSummary() {
    return {
      sectorId: this.sectorId,
      agentCount: this.agents.length,
      debateSummary: this.getDebateSummary(),
    };
  }
}

module.exports = ManagerAgent;
