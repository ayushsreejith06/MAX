const { startDiscussion } = require('../agents/discussion/discussionLifecycle');
const { loadDiscussions } = require('../utils/discussionStorage');

/**
 * ManagerEngine - Handles manager-level decisions including discussion creation
 */
class ManagerEngine {
  constructor() {
    this.tickCounter = 0;
  }

  /**
   * Handle discussion ready flag and create discussion if needed
   * @param {string} sectorId - Sector ID
   * @param {boolean} discussionReady - Whether discussion should be triggered
   * @param {Object} sector - Sector object with agents
   * @returns {Promise<{created: boolean, discussionId: string|null, checklistState: Object|null}>}
   */
  async handleDiscussionReady(sectorId, discussionReady, sector) {
    // DEBUG: Log when receiving discussionReady = true
    if (discussionReady) {
      console.log(`[ManagerEngine] Received discussionReady = true for sector ${sectorId}`);
    }

    if (!discussionReady) {
      return { created: false, discussionId: null, checklistState: null };
    }

    try {
      // Check if there's already an open discussion for this sector
      const existingDiscussions = await loadDiscussions();
      const openDiscussion = existingDiscussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'open' || d.status === 'created' || d.status === 'in_progress')
      );

      if (openDiscussion) {
        // DEBUG: Log that discussion already exists
        console.log(`[ManagerEngine] Discussion already exists for sector ${sectorId}: ${openDiscussion.id}`);
        const checklistState = this._getChecklistState(openDiscussion);
        console.log(`[ManagerEngine] Discussion ID: ${openDiscussion.id}, Checklist State:`, JSON.stringify(checklistState, null, 2));
        return { 
          created: false, 
          discussionId: openDiscussion.id, 
          checklistState 
        };
      }

      // Create new discussion
      const sectorName = sector.sectorName || sector.name || sectorId;
      const title = `Discussion triggered - All agents confident (${sectorName})`;
      
      // Get agent IDs from sector
      const agentIds = Array.isArray(sector.agents) 
        ? sector.agents.filter(a => a && a.id && a.role !== 'manager').map(a => a.id)
        : [];

      const discussionRoom = await startDiscussion(sectorId, title, agentIds);
      
      // DEBUG: Log when creating a new discussion
      console.log(`[ManagerEngine] Created new discussion: ID = ${discussionRoom.id}`);
      
      const checklistState = this._getChecklistState(discussionRoom);
      
      // DEBUG: Log discussion ID and checklist state
      console.log(`[ManagerEngine] Discussion ID: ${discussionRoom.id}, Checklist State:`, JSON.stringify(checklistState, null, 2));

      return { 
        created: true, 
        discussionId: discussionRoom.id, 
        checklistState 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error handling discussion ready:`, error);
      return { created: false, discussionId: null, checklistState: null };
    }
  }

  /**
   * Get checklist state from discussion
   * @private
   */
  _getChecklistState(discussion) {
    if (!discussion) return null;
    
    return {
      id: discussion.id,
      status: discussion.status,
      hasMessages: Array.isArray(discussion.messages) && discussion.messages.length > 0,
      messageCount: Array.isArray(discussion.messages) ? discussion.messages.length : 0,
      hasDecision: !!discussion.finalDecision,
      agentCount: Array.isArray(discussion.agentIds) ? discussion.agentIds.length : 0,
      createdAt: discussion.createdAt,
      updatedAt: discussion.updatedAt
    };
  }

  /**
   * Increment and get tick counter
   */
  getNextTick() {
    this.tickCounter++;
    return this.tickCounter;
  }
}

module.exports = ManagerEngine;

