// ManagerAgent.js - Base class stub

const { loadDiscussions, saveDiscussions } = require('../../utils/discussionStorage');
const DiscussionRoom = require('../../models/DiscussionRoom');

class ManagerAgent {
  constructor(sectorId) {
    this.sectorId = sectorId;
    this.agents = [];
    this.discussions = [];
    this.state = {};
  }

  async loadState() {
    // Load all discussions from debateStorage
    const allDiscussions = await loadDebates();
    
    // Filter by this.sectorId and convert to DebateRoom instances
    this.discussions = allDiscussions
      .filter(discussion => discussion.sectorId === this.sectorId)
      .map(discussion => DebateRoom.fromData(discussion));
  }

  saveState() {
    // Future hook for saving state
    // For now, discussions are saved individually via saveDebates() in startDiscussion()
    // This method can be extended to save aggregated state if needed
  }

  async startDiscussion(title, agentIds) {
    // Create a new DebateRoom for this.sectorId
    // Only ManagerAgent can call this method - users cannot start discussions
    const discussion = new DebateRoom(this.sectorId, title, agentIds);
    
    // Load all discussions, add the new one, and save
    const allDiscussions = await loadDebates();
    allDiscussions.push(discussion.toJSON());
    await saveDebates(allDiscussions);
    
    // Add to this.discussions
    this.discussions.push(discussion);
    
    // Return the new discussion
    return discussion;
  }

  async closeDiscussion(discussionId) {
    // Close a discussion by ID
    // Only ManagerAgent can call this method
    const allDiscussions = await loadDebates();
    const discussionIndex = allDiscussions.findIndex(d => d.id === discussionId);

    if (discussionIndex === -1) {
      throw new Error(`Discussion with ID ${discussionId} not found`);
    }

    const discussionData = allDiscussions[discussionIndex];
    const discussionRoom = DebateRoom.fromData(discussionData);

    discussionRoom.status = 'closed';
    discussionRoom.updatedAt = new Date().toISOString();

    allDiscussions[discussionIndex] = discussionRoom.toJSON();
    await saveDebates(allDiscussions);

    // Update local state
    const localIndex = this.discussions.findIndex(d => d.id === discussionId);
    if (localIndex !== -1) {
      this.discussions[localIndex] = discussionRoom;
    }

    return discussionRoom;
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
    // Count discussions by status for this.sectorId
    const statusCounts = {};
    let lastUpdated = null;
    const debatingIds = [];

    this.discussions.forEach(discussion => {
      // Count by status
      statusCounts[discussion.status] = (statusCounts[discussion.status] || 0) + 1;
      
      // Track last updated timestamp
      if (discussion.updatedAt) {
        const updatedAt = new Date(discussion.updatedAt).getTime();
        if (!lastUpdated || updatedAt > lastUpdated) {
          lastUpdated = updatedAt;
        }
      }
      
      // Track currently "debating" discussions
      if (discussion.status === 'debating') {
        debatingIds.push(discussion.id);
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

