const { startDiscussion } = require('../agents/discussion/discussionLifecycle');
const { loadDiscussions, findDiscussionById, saveDiscussion } = require('../utils/discussionStorage');
const DiscussionEngine = require('./DiscussionEngine');
const DiscussionRoom = require('../models/DiscussionRoom');
const { loadAgents } = require('../utils/agentStorage');
const { updateSector } = require('../utils/sectorStorage');

/**
 * ManagerEngine - Handles manager-level decisions including discussion creation
 */
class ManagerEngine {
  constructor() {
    this.tickCounter = 0;
    this.discussionEngine = new DiscussionEngine();
    this.confidenceThreshold = 65; // Default threshold for discussion readiness
    this.approvalConfidenceThreshold = 65; // Threshold for auto-approving checklist items
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
   * Start discussion if confidence threshold is met and no active discussion exists
   * @param {string} sectorId - Sector ID
   * @param {Object} sector - Sector object with agents
   * @returns {Promise<{started: boolean, discussionId: string|null}>}
   */
  async startDiscussionIfReady(sectorId, sector) {
    try {
      // Check if confidence threshold is met
      const validAgents = (sector.agents || []).filter(agent => agent && agent.id);
      if (validAgents.length === 0) {
        return { started: false, discussionId: null };
      }

      const allConfident = validAgents.every(agent => {
        const confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
        return confidence >= this.confidenceThreshold;
      });

      if (!allConfident) {
        return { started: false, discussionId: null };
      }

      // Check if there's already an active discussion for this sector
      const existingDiscussions = await loadDiscussions();
      const activeDiscussion = existingDiscussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'open' || d.status === 'created' || d.status === 'in_progress' || d.status === 'active')
      );

      if (activeDiscussion) {
        return { started: false, discussionId: activeDiscussion.id };
      }

      // Start new discussion
      const sectorName = sector.sectorName || sector.name || sectorId;
      const title = `Discussion triggered - All agents confident (${sectorName})`;
      
      // Get agent IDs from sector
      const agentIds = Array.isArray(sector.agents) 
        ? sector.agents.filter(a => a && a.id && a.role !== 'manager').map(a => a.id)
        : [];

      const discussionRoom = await startDiscussion(sectorId, title, agentIds);
      
      console.log(`[ManagerEngine] Started new discussion: ID = ${discussionRoom.id}`);

      return { 
        started: true, 
        discussionId: discussionRoom.id 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error starting discussion:`, error);
      return { started: false, discussionId: null };
    }
  }

  /**
   * Finalize checklist when discussion reaches max rounds
   * @param {string} sectorId - Sector ID
   * @param {Object} sector - Sector object
   * @returns {Promise<{finalized: boolean, discussionId: string|null}>}
   */
  async finalizeChecklist(sectorId, sector) {
    try {
      // Find the active discussion for this sector
      const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
      if (discussions.length === 0) {
        return { finalized: false, discussionId: null };
      }

      // Get the most recent discussion
      const discussionId = discussions[discussions.length - 1];
      const discussionData = await findDiscussionById(discussionId);

      if (!discussionData) {
        return { finalized: false, discussionId: null };
      }

      // Use DiscussionEngine to finalize
      const updatedSector = await this.discussionEngine.finalizeDiscussion(sector);
      
      console.log(`[ManagerEngine] Finalized checklist for discussion: ID = ${discussionId}`);

      return { 
        finalized: true, 
        discussionId: discussionId 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error finalizing checklist:`, error);
      return { finalized: false, discussionId: null };
    }
  }

  /**
   * Create a new discussion for a sector
   * @param {string} sectorId - Sector ID
   * @returns {Promise<{created: boolean, discussion: Object|null}>}
   */
  async createDiscussion(sectorId) {
    try {
      // Check if there's already an active discussion for this sector
      const existingDiscussions = await loadDiscussions();
      const activeDiscussion = existingDiscussions.find(d => 
        d.sectorId === sectorId && 
        (d.status === 'open' || d.status === 'created' || d.status === 'in_progress' || d.status === 'active')
      );

      if (activeDiscussion) {
        console.log(`[ManagerEngine] Active discussion already exists for sector ${sectorId}: ${activeDiscussion.id}`);
        return { 
          created: false, 
          discussion: DiscussionRoom.fromData(activeDiscussion) 
        };
      }

      // Load sector to get sector name and agents
      const { getSectorById } = require('../utils/sectorStorage');
      const sector = await getSectorById(sectorId);
      
      if (!sector) {
        throw new Error(`Sector ${sectorId} not found`);
      }

      // Get agent IDs from sector
      const agentIds = Array.isArray(sector.agents) 
        ? sector.agents.filter(a => a && a.id && a.role !== 'manager').map(a => a.id)
        : [];

      if (agentIds.length === 0) {
        console.warn(`[ManagerEngine] No agents found for sector ${sectorId}`);
        return { created: false, discussion: null };
      }

      // Create new discussion using DiscussionEngine
      const updatedSector = await this.discussionEngine.startDiscussion(sector);
      
      // Get the newly created discussion
      const discussions = Array.isArray(updatedSector.discussions) ? updatedSector.discussions : [];
      if (discussions.length === 0) {
        throw new Error('Discussion was created but not found in sector');
      }

      const discussionId = discussions[discussions.length - 1];
      const discussionData = await findDiscussionById(discussionId);
      
      if (!discussionData) {
        throw new Error(`Discussion ${discussionId} not found`);
      }

      const discussion = DiscussionRoom.fromData(discussionData);
      
      console.log(`[ManagerEngine] Created new discussion: ID = ${discussion.id} for sector ${sectorId}`);
      
      return { 
        created: true, 
        discussion: discussion 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error creating discussion:`, error);
      return { created: false, discussion: null };
    }
  }

  /**
   * Handle checklist after finalization - approve items and mark discussion as finalized
   * @param {Object} discussion - Discussion object (DiscussionRoom instance)
   * @returns {Promise<{handled: boolean, discussionId: string|null}>}
   */
  async handleChecklist(discussion) {
    try {
      if (!discussion || !discussion.id) {
        throw new Error('Invalid discussion: discussion and discussion.id are required');
      }

      // Reload discussion to get latest state
      const discussionData = await findDiscussionById(discussion.id);
      if (!discussionData) {
        throw new Error(`Discussion ${discussion.id} not found`);
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);

      // If discussion is already finalized, skip
      if (discussionRoom.status === 'finalized' || discussionRoom.status === 'completed') {
        console.log(`[ManagerEngine] Discussion ${discussion.id} already finalized`);
        return { handled: true, discussionId: discussion.id };
      }

      // Load sector to use approveOrRejectChecklist
      const { getSectorById } = require('../utils/sectorStorage');
      const sector = await getSectorById(discussionRoom.sectorId);
      
      if (!sector) {
        throw new Error(`Sector ${discussionRoom.sectorId} not found`);
      }

      // Ensure sector has discussions array
      sector.discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
      if (!sector.discussions.includes(discussion.id)) {
        sector.discussions.push(discussion.id);
      }

      // Approve checklist items (auto-approve all)
      const updatedSector = await this.approveOrRejectChecklist(sector);

      // Reload discussion after approval
      const updatedDiscussionData = await findDiscussionById(discussion.id);
      if (!updatedDiscussionData) {
        throw new Error(`Discussion ${discussion.id} not found after approval`);
      }

      const updatedDiscussionRoom = DiscussionRoom.fromData(updatedDiscussionData);

      // Mark discussion as finalized
      updatedDiscussionRoom.status = 'finalized';
      updatedDiscussionRoom.updatedAt = new Date().toISOString();

      // Save finalized discussion
      await saveDiscussion(updatedDiscussionRoom);

      console.log(`[ManagerEngine] Handled checklist and finalized discussion: ID = ${discussion.id}`);

      return { 
        handled: true, 
        discussionId: discussion.id 
      };
    } catch (error) {
      console.error(`[ManagerEngine] Error handling checklist:`, error);
      return { handled: false, discussionId: null };
    }
  }

  /**
   * Increment and get tick counter
   */
  getNextTick() {
    this.tickCounter++;
    return this.tickCounter;
  }

  /**
   * Handle checklist approval/rejection after DiscussionEngine finalizes checklist
   * @param {Object|string} discussion - Discussion object or discussion ID
   * @returns {Promise<Object>} Updated discussion with manager decisions
   */
  async handleChecklist(discussion) {
    // Load discussion if ID is provided
    let discussionRoom;
    if (typeof discussion === 'string') {
      const discussionData = await findDiscussionById(discussion);
      if (!discussionData) {
        throw new Error(`Discussion ${discussion} not found`);
      }
      discussionRoom = DiscussionRoom.fromData(discussionData);
    } else if (discussion instanceof DiscussionRoom) {
      discussionRoom = discussion;
    } else {
      // Assume it's a plain object
      discussionRoom = DiscussionRoom.fromData(discussion);
    }

    // Ensure checklist exists
    if (!Array.isArray(discussionRoom.checklist) || discussionRoom.checklist.length === 0) {
      console.warn(`[ManagerEngine] Discussion ${discussionRoom.id} has no checklist items to process`);
      return discussionRoom;
    }

    // Ensure managerDecisions array exists
    if (!Array.isArray(discussionRoom.managerDecisions)) {
      discussionRoom.managerDecisions = [];
    }

    // Get confidence value - use discussion confidence if available, otherwise calculate average from agents
    let confidence = discussionRoom.confidence;
    if (confidence === null || confidence === undefined) {
      // Calculate average confidence from agents in the discussion
      const allAgents = await loadAgents();
      const discussionAgents = allAgents.filter(agent => 
        agent && agent.id && discussionRoom.agentIds.includes(agent.id)
      );
      
      if (discussionAgents.length > 0) {
        const totalConfidence = discussionAgents.reduce((sum, agent) => {
          const agentConfidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
          return sum + agentConfidence;
        }, 0);
        confidence = totalConfidence / discussionAgents.length;
      } else {
        confidence = 0; // Default to 0 if no agents found
      }
    }

    // Process each checklist item
    const managerDecisions = [];
    for (const item of discussionRoom.checklist) {
      // Check if this item already has a manager decision
      const existingDecision = discussionRoom.managerDecisions.find(
        decision => decision.item && decision.item.id === item.id
      );

      if (existingDecision) {
        // Skip items that already have decisions
        managerDecisions.push(existingDecision);
        continue;
      }

      // Determine approval based on confidence threshold
      const approved = confidence > this.approvalConfidenceThreshold;
      const reason = approved 
        ? `Auto-approved: confidence (${confidence.toFixed(2)}) exceeds threshold (${this.approvalConfidenceThreshold})`
        : `Auto-rejected: confidence (${confidence.toFixed(2)}) below threshold (${this.approvalConfidenceThreshold}). Needs refinement.`;

      // Create manager decision object
      const managerDecision = {
        item: item,
        approved: approved,
        reason: reason
      };

      managerDecisions.push(managerDecision);
    }

    // Update discussion with manager decisions
    discussionRoom.managerDecisions = managerDecisions;
    discussionRoom.status = 'finalized';
    discussionRoom.updatedAt = new Date().toISOString();

    // Save updated discussion
    await saveDiscussion(discussionRoom);

    console.log(`[ManagerEngine] Processed ${managerDecisions.length} checklist items for discussion ${discussionRoom.id}. Approved: ${managerDecisions.filter(d => d.approved).length}, Rejected: ${managerDecisions.filter(d => !d.approved).length}`);

    return discussionRoom;
  }

  /**
   * Start discussion if confidence >= threshold and no active discussion exists
   * @param {Object} sector - Sector object with agents
   * @returns {Promise<Object|null>} Updated sector with new discussion, or null if not started
   */
  async startDiscussionIfReady(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Check if all agents have confidence >= threshold
    const agents = Array.isArray(sector.agents) ? sector.agents : [];
    if (agents.length === 0) {
      return null;
    }

    const allConfident = agents.every(agent => {
      const confidence = typeof agent.confidence === 'number' ? agent.confidence : 0;
      return confidence >= this.confidenceThreshold;
    });

    if (!allConfident) {
      return null;
    }

    // Check if there's already an active discussion
    const existingDiscussions = await loadDiscussions();
    const activeDiscussion = existingDiscussions.find(d => 
      d.sectorId === sector.id && 
      (d.status === 'active' || d.status === 'in_progress' || d.status === 'open' || d.status === 'created')
    );

    if (activeDiscussion) {
      // Discussion already exists, return null
      return null;
    }

    // Start new discussion
    const updatedSector = await this.discussionEngine.startDiscussion(sector);
    return updatedSector;
  }

  /**
   * Approve or reject checklist items - auto-approves all items for now
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with approved/rejected items
   */
  async approveOrRejectChecklist(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);
    
    // Ensure checklistDraft exists
    if (!Array.isArray(discussionRoom.checklistDraft)) {
      discussionRoom.checklistDraft = [];
    }

    // Initialize needsRefinement array if it doesn't exist
    if (!Array.isArray(discussionRoom.needsRefinement)) {
      discussionRoom.needsRefinement = [];
    }

    // Auto-approve all items in checklistDraft
    const approvedItems = [];

    for (const item of discussionRoom.checklistDraft) {
      // Skip items that have already been processed
      if (item.status === 'approved' || item.status === 'rejected') {
        if (item.status === 'approved') {
          approvedItems.push(item);
        }
        continue;
      }

      // Auto-approve all items
      // Ensure item has required fields for compatibility
      if (!item.text && item.reasoning) {
        // Convert new format (action + reasoning) to text format for compatibility
        item.text = `${item.action || 'deploy capital'}: ${item.reasoning}`;
      } else if (!item.text && item.action) {
        item.text = item.action;
      }
      
      item.status = 'approved';
      approvedItems.push(item);
    }

    // Update checklistDraft with status
    discussionRoom.checklistDraft = discussionRoom.checklistDraft.map(item => {
      const updated = approvedItems.find(a => a.id === item.id);
      return updated || item;
    });

    // Save updated discussion
    await saveDiscussion(discussionRoom);

    // Update sector
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions
    });
    updatedSector.discussions = discussions;

    return updatedSector;
  }

  /**
   * Refine rejected items by running another discussion round
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with refined items
   */
  async refineRejected(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Check if there are rejected items in needs refinement
    if (!Array.isArray(discussionRoom.needsRefinement) || 
        discussionRoom.needsRefinement.length === 0) {
      // No rejected items to refine
      return sector;
    }

    // Load agents for this sector
    const allAgents = await loadAgents();
    const sectorAgents = allAgents.filter(agent => 
      agent && agent.sectorId === sector.id && agent.role !== 'manager'
    );

    if (sectorAgents.length === 0) {
      throw new Error(`No agents found for sector ${sector.id}`);
    }

    // Run a round of discussion to refine rejected items
    const updatedSector = await this.discussionEngine.runRound(sector, sectorAgents);

    return updatedSector;
  }

  /**
   * Finalize checklist by moving approved items to sector checklistItems
   * @param {Object} sector - Sector object
   * @returns {Promise<Object>} Updated sector with finalized checklist
   */
  async finalizeChecklist(sector) {
    if (!sector || !sector.id) {
      throw new Error('Invalid sector: sector and sector.id are required');
    }

    // Find the active discussion for this sector
    const discussions = Array.isArray(sector.discussions) ? sector.discussions : [];
    if (discussions.length === 0) {
      throw new Error(`No discussion found for sector ${sector.id}`);
    }

    // Get the most recent discussion
    const discussionId = discussions[discussions.length - 1];
    const discussionData = await findDiscussionById(discussionId);

    if (!discussionData) {
      throw new Error(`Discussion ${discussionId} not found`);
    }

    // Load discussion room
    const discussionRoom = DiscussionRoom.fromData(discussionData);

    // Get approved items from checklistDraft
    const approvedItems = Array.isArray(discussionRoom.checklistDraft)
      ? discussionRoom.checklistDraft.filter(item => item.status === 'approved')
      : [];

    // Move approved items to discussion checklist
    const checklistItems = approvedItems.map((item, index) => ({
      id: `checklist-${discussionRoom.id}-${index}`,
      text: item.text,
      agentId: item.agentId,
      agentName: item.agentName,
      round: item.round,
      completed: false,
      createdAt: new Date().toISOString()
    }));

    // Update discussion checklist
    discussionRoom.checklist = checklistItems;
    
    // Clear discussionDraft
    discussionRoom.checklistDraft = [];
    
    // Mark discussion as completed
    discussionRoom.status = 'completed';
    discussionRoom.updatedAt = new Date().toISOString();

    // Save finalized discussion
    await saveDiscussion(discussionRoom);

    // Update sector with checklistItems
    const updatedSector = await updateSector(sector.id, {
      discussions: discussions,
      checklistItems: checklistItems
    });
    updatedSector.discussions = discussions;
    updatedSector.checklistItems = checklistItems;

    return updatedSector;
  }
}

module.exports = ManagerEngine;

