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
    // Load all discussions from discussionStorage
    const allDiscussions = await loadDiscussions();
    
    // Filter by this.sectorId and convert to DiscussionRoom instances
    this.discussions = allDiscussions
      .filter(discussion => discussion.sectorId === this.sectorId)
      .map(discussion => DiscussionRoom.fromData(discussion));
  }

  saveState() {
    // Future hook for saving state
    // For now, discussions are saved individually via saveDiscussions() in startDiscussion()
    // This method can be extended to save aggregated state if needed
  }

  async startDiscussion(title, agentIds) {
    // Create a new DiscussionRoom for this.sectorId
    // Only ManagerAgent can call this method - users cannot start discussions
    const discussion = new DiscussionRoom(this.sectorId, title, agentIds);
    
    // Load all discussions, add the new one, and save
    const allDiscussions = await loadDiscussions();
    allDiscussions.push(discussion.toJSON());
    await saveDiscussions(allDiscussions);
    
    // Add to this.discussions
    this.discussions.push(discussion);
    
    // Return the new discussion
    return discussion;
  }

  async closeDiscussion(discussionId) {
    // Close a discussion by ID
    // Only ManagerAgent can call this method
    const allDiscussions = await loadDiscussions();
    const discussionIndex = allDiscussions.findIndex(d => d.id === discussionId);

    if (discussionIndex === -1) {
      throw new Error(`Discussion with ID ${discussionId} not found`);
    }

    const discussionData = allDiscussions[discussionIndex];
    const discussionRoom = DiscussionRoom.fromData(discussionData);

    discussionRoom.status = 'closed';
    discussionRoom.updatedAt = new Date().toISOString();

    allDiscussions[discussionIndex] = discussionRoom.toJSON();
    await saveDiscussions(allDiscussions);

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

  async decisionLoop() {
    // Ensure discussions are loaded
    if (this.discussions.length === 0) {
      await this.loadState();
    }

    const now = Date.now();
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const NO_DISCUSSION_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

    // Find open discussions (status: 'created' or 'active')
    // Note: 'debating' is legacy status, handled for backward compatibility
    const openDiscussions = this.discussions.filter(
      d => d.status === 'created' || d.status === 'active' || d.status === 'debating'
    );

    // Check for stale discussions and auto-close them
    for (const discussion of openDiscussions) {
      if (discussion.updatedAt) {
        const updatedAt = new Date(discussion.updatedAt).getTime();
        const ageMs = now - updatedAt;

        if (ageMs > STALE_THRESHOLD_MS) {
          console.log(`[ManagerAgent ${this.sectorId}] Auto-closing stale discussion: ${discussion.id} (age: ${Math.round(ageMs / 1000 / 60)} minutes)`);
          try {
            await this.closeDiscussion(discussion.id);
          } catch (error) {
            console.error(`[ManagerAgent ${this.sectorId}] Error closing stale discussion ${discussion.id}:`, error.message);
          }
        }
      }
    }

    // Reload state after closing discussions
    await this.loadState();

    // Check if we need to start a new discussion
    // Note: 'debating' is legacy status, handled for backward compatibility
    const currentOpenDiscussions = this.discussions.filter(
      d => d.status === 'created' || d.status === 'active' || d.status === 'debating'
    );

    if (currentOpenDiscussions.length === 0) {
      // No open discussions - check when the last discussion was created/updated
      let lastDiscussionTime = null;

      if (this.discussions.length > 0) {
        // Find the most recent discussion (by createdAt or updatedAt)
        for (const discussion of this.discussions) {
          const times = [];
          if (discussion.createdAt) {
            times.push(new Date(discussion.createdAt).getTime());
          }
          if (discussion.updatedAt) {
            times.push(new Date(discussion.updatedAt).getTime());
          }
          if (times.length > 0) {
            const maxTime = Math.max(...times);
            if (!lastDiscussionTime || maxTime > lastDiscussionTime) {
              lastDiscussionTime = maxTime;
            }
          }
        }
      }

      const shouldStartNew = !lastDiscussionTime || (now - lastDiscussionTime > NO_DISCUSSION_THRESHOLD_MS);

      if (shouldStartNew) {
        console.log(`[ManagerAgent ${this.sectorId}] Auto-starting new discussion (no open discussions for ${lastDiscussionTime ? Math.round((now - lastDiscussionTime) / 1000 / 60) : 'ever'} minutes)`);
        try {
          // Start a new discussion with available agents
          const agentIds = this.agents.length > 0 ? this.agents.map(a => a.id || a) : [];
          await this.startDiscussion(`Auto-generated discussion ${new Date().toISOString()}`, agentIds);
        } catch (error) {
          console.error(`[ManagerAgent ${this.sectorId}] Error starting new discussion:`, error.message);
        }
      }
    }
  }

  crossSectorComms() {
    // Placeholder logs simulating inter-sector communication
    // No real networking yet - Phase 2 minimal implementation
    console.log(`[ManagerAgent ${this.sectorId}] Cross-sector communication placeholder`);
    console.log(`[ManagerAgent ${this.sectorId}] Simulating message broadcast to other sectors...`);
    console.log(`[ManagerAgent ${this.sectorId}] Simulating receiving updates from sector network...`);
    console.log(`[ManagerAgent ${this.sectorId}] Cross-sector sync status: pending (not implemented)`);
  }

  getDiscussionSummary() {
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
      
      // Track currently "active" discussions (including legacy "debating" status)
      if (discussion.status === 'active' || discussion.status === 'debating') {
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
      discussionSummary: this.getDiscussionSummary()
    };
  }
}

module.exports = ManagerAgent;

