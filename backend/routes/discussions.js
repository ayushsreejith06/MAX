const DiscussionRoom = require('../models/DiscussionRoom');
const { loadDiscussions, saveDiscussions, saveDiscussion, findDiscussionById, deleteDiscussion } = require('../utils/discussionStorage');
const { getSectorById, updateSector, getAllSectors } = require('../utils/sectorStorage');
const {
  startDiscussion,
  collectArguments,
  aggregateVotes,
  produceDecision,
  closeDiscussion,
  archiveDiscussion
} = require('../agents/discussion/discussionLifecycle');
const { loadAgents } = require('../utils/agentStorage');
const { loadRejectedItems } = require('../utils/rejectedItemsStorage');
const { extractConfidence } = require('../utils/confidenceUtils');
const ExecutionEngine = require('../core/ExecutionEngine');
const { formatChecklistItemDescription } = require('../discussions/workflow/checklistBuilder');
const { transitionStatus, STATUS, normalizeStatus } = require('../utils/discussionStatusService');
const { requireManager, logViolation } = require('../utils/managerAuth');
const { validateNoChecklist } = require('../utils/checklistGuard');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Helper to enrich discussion with agent names (status normalization removed - use status service)
async function enrichDiscussion(discussion) {
  try {
    const agents = await loadAgents();
    const agentMap = new Map(agents.map(agent => [agent.id, agent]));

    // Normalize status for display (read-only, no mutation)
    // Status is managed by discussionStatusService
    const normalizedStatus = normalizeStatus(discussion.status);

    // Enrich messages with agent names
    const enrichedMessages = (discussion.messages || []).map(msg => {
      const agent = agentMap.get(msg.agentId);
      return {
        ...msg,
        agentName: agent?.name || msg.agentName || 'Unknown Agent',
        timestamp: msg.timestamp || msg.createdAt
      };
    });

    // Sort messages by timestamp to ensure chronological order
    enrichedMessages.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    return {
      ...discussion,
      status: normalizedStatus, // Return normalized status for display
      messages: enrichedMessages
    };
  } catch (error) {
    log(`Error enriching discussion: ${error.message}`);
    return discussion;
  }
}

module.exports = async (fastify) => {
  // Log route registration for debugging
  console.log('[discussions route] Registering routes with prefix /api/discussions');
  
  // GET /discussions/rejected-items - REMOVED (checklist functionality removed)
  /*
  fastify.get('/rejected-items', async (request, reply) => {
    try {
      log('GET /discussions/rejected-items - Fetching all rejected items');
      
      // Load rejected items from storage
      const storedRejectedItems = await loadRejectedItems();
      
      // Also query all discussions directly to find rejected items
      const allDiscussions = await loadDiscussions();
      const { getAllSectors } = require('../utils/sectorStorage');
      const sectors = await getAllSectors();
      const sectorMap = new Map();
      sectors.forEach(sector => {
        if (sector && sector.id) {
          sectorMap.set(sector.id, {
            symbol: sector.symbol || sector.sectorSymbol || 'N/A',
            name: sector.name || sector.sectorName || 'Unknown Sector'
          });
        }
      });
      
      // Extract rejected items from all discussions
      const rejectedItemsFromDiscussions = [];
      const storedIds = new Set(storedRejectedItems.map(item => item.id));
      let totalChecked = 0;
      let totalRejectedDecisions = 0;
      let totalExcludedAcceptedRejections = 0;
      let totalExcludedOtherStatuses = 0;
      
      for (const discussion of allDiscussions) {
        // Get manager decisions to find rejected items
        const managerDecisions = Array.isArray(discussion.managerDecisions) ? discussion.managerDecisions : [];
        const checklist = Array.isArray(discussion.checklist) ? discussion.checklist : [];
        
        // Find rejected decisions (approved === false)
        const rejectedDecisions = managerDecisions.filter(decision => 
          decision.approved === false && decision.item
        );
        
        totalRejectedDecisions += rejectedDecisions.length;
        
        if (rejectedDecisions.length > 0) {
          const sectorInfo = discussion.sectorId ? sectorMap.get(discussion.sectorId) : null;
          const sectorSymbol = sectorInfo?.symbol || 'N/A';
          
          for (const decision of rejectedDecisions) {
            totalChecked++;
            const item = decision.item;
            
            // EXCLUDE items that have been accepted (ACCEPT_REJECTION status)
            // These should NOT appear in rejected items list
            const itemStatus = item.status || '';
            if (itemStatus === 'ACCEPT_REJECTION' || itemStatus === 'accept_rejection') {
              totalExcludedAcceptedRejections++;
              log(`[REJECTED ITEMS] Excluding item ${item.id} from discussion ${discussion.id}: Status is ACCEPT_REJECTION`);
              continue;
            }
            
            // Only include items that are actually in REVISE_REQUIRED status or require revision
            // Exclude items that are APPROVED, PENDING (not yet evaluated), or other statuses
            if (itemStatus !== 'REVISE_REQUIRED' && 
                itemStatus !== 'revise_required' && 
                item.requiresRevision !== true &&
                itemStatus !== 'REJECTED' &&
                itemStatus !== 'rejected') {
              totalExcludedOtherStatuses++;
              log(`[REJECTED ITEMS] Excluding item ${item.id} from discussion ${discussion.id}: Status is ${itemStatus}, requiresRevision=${item.requiresRevision}`);
              continue;
            }
            
            const itemText = item.reason || item.reasoning || item.text || item.description || '';
            const itemId = `rejected-${discussion.id}-${item.id || Date.now()}`;
            
            // Only add if not already in stored items
            if (!storedIds.has(itemId)) {
              rejectedItemsFromDiscussions.push({
                id: itemId,
                text: itemText,
                discussionId: discussion.id,
                discussionTitle: discussion.title || 'Untitled Discussion',
                sectorId: discussion.sectorId || '',
                sectorSymbol: sectorSymbol,
                timestamp: discussion.updatedAt ? new Date(discussion.updatedAt).getTime() : Date.now()
              });
              log(`[REJECTED ITEMS] Including item ${item.id} from discussion ${discussion.id}: Status=${itemStatus}, requiresRevision=${item.requiresRevision}`);
            }
          }
        }
      }
      
      // Filter stored items to exclude ACCEPT_REJECTION status items
      const filteredStoredItems = storedRejectedItems.filter(item => {
        // Stored items don't have status field, but we can check if they're still valid
        // by checking if they exist in current discussions with REVISE_REQUIRED status
        return true; // Keep all stored items for now (they're historical)
      });
      
      // Combine stored items with items from discussions
      const allRejectedItems = [...filteredStoredItems, ...rejectedItemsFromDiscussions];
      
      // Sort by timestamp (newest first)
      allRejectedItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      log(`[REJECTED ITEMS] Found ${allRejectedItems.length} rejected items total:`);
      log(`  - ${filteredStoredItems.length} from storage`);
      log(`  - ${rejectedItemsFromDiscussions.length} from discussions`);
      log(`  - Checked ${totalChecked} rejected decisions`);
      log(`  - Excluded ${totalExcludedAcceptedRejections} items with ACCEPT_REJECTION status`);
      log(`  - Excluded ${totalExcludedOtherStatuses} items with other statuses`);
      
      return reply.status(200).send({
        rejected: allRejectedItems
      });
    } catch (error) {
      log(`Error fetching rejected items: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
  */

  // GET /discussions/finalized-rejections - REMOVED (checklist functionality removed)
  /*
  fastify.get('/finalized-rejections', async (request, reply) => {
    try {
      const { sectorId, managerId, discussionId, startTime, endTime, page = '1', pageSize = '20' } = request.query;
      
      log('GET /discussions/finalized-rejections - Fetching finalized rejections');
      
      const allDiscussions = await loadDiscussions();
      const { getAllSectors } = require('../utils/sectorStorage');
      const sectors = await getAllSectors();
      const sectorMap = new Map();
      sectors.forEach(sector => {
        if (sector && sector.id) {
          sectorMap.set(sector.id, {
            symbol: sector.symbol || sector.sectorSymbol || 'N/A',
            name: sector.name || sector.sectorName || 'Unknown Sector'
          });
        }
      });
      
      // Load agents to get manager info
      const agents = await loadAgents();
      const managerMap = new Map();
      agents.forEach(agent => {
        if (agent && agent.role && agent.role.toLowerCase().includes('manager')) {
          managerMap.set(agent.id, agent);
        }
      });
      
      const finalizedRejections = [];
      
      for (const discussion of allDiscussions) {
        // Only include rejections from closed/archived/finalized discussions
        const isFinalized = discussion.status === 'CLOSED' || 
                           discussion.status === 'closed' || 
                           discussion.status === 'archived' || 
                           discussion.status === 'finalized' ||
                           discussion.status === 'decided';
        
        if (!isFinalized) {
          continue;
        }
        
        // Apply filters
        if (sectorId && discussion.sectorId !== sectorId) {
          continue;
        }
        
        if (discussionId && discussion.id !== discussionId) {
          continue;
        }
        
        // Check time window
        const discussionTime = discussion.updatedAt ? new Date(discussion.updatedAt).getTime() : Date.now();
        if (startTime && discussionTime < parseInt(startTime, 10)) {
          continue;
        }
        if (endTime && discussionTime > parseInt(endTime, 10)) {
          continue;
        }
        
        const managerDecisions = Array.isArray(discussion.managerDecisions) ? discussion.managerDecisions : [];
        const checklist = Array.isArray(discussion.checklist) ? discussion.checklist : [];
        
        // Find rejected decisions (approved === false)
        const rejectedDecisions = managerDecisions.filter(decision => 
          decision.approved === false && decision.item
        );
        
        for (const decision of rejectedDecisions) {
          const item = decision.item;
          
          // Only include finalized rejections (not REVISE_REQUIRED or pending)
          const itemStatus = item.status || '';
          if (itemStatus === 'REVISE_REQUIRED' || itemStatus === 'revise_required' || item.requiresRevision === true) {
            continue; // Skip pending/revisable items
          }
          
          // Skip ACCEPT_REJECTION status items
          if (itemStatus === 'ACCEPT_REJECTION' || itemStatus === 'accept_rejection') {
            continue;
          }
          
          // Filter by manager if specified
          if (managerId) {
            // Check if discussion's manager matches
            const discussionManager = agents.find(a => 
              a.sectorId === discussion.sectorId && 
              a.role && a.role.toLowerCase().includes('manager')
            );
            if (!discussionManager || discussionManager.id !== managerId) {
              continue;
            }
          }
          
          const sectorInfo = discussion.sectorId ? sectorMap.get(discussion.sectorId) : null;
          const sectorSymbol = sectorInfo?.symbol || 'N/A';
          
          const itemText = item.reason || item.reasoning || item.text || item.description || '';
          const itemId = `finalized-rejection-${discussion.id}-${item.id || Date.now()}`;
          
          finalizedRejections.push({
            id: itemId,
            text: itemText,
            discussionId: discussion.id,
            discussionTitle: discussion.title || 'Untitled Discussion',
            sectorId: discussion.sectorId || '',
            sectorSymbol: sectorSymbol,
            managerId: decision.managerId || null,
            managerReason: decision.reason || item.managerReason || null,
            timestamp: discussionTime,
            action: item.action || null,
            amount: item.amount || null,
            confidence: item.confidence || null
          });
        }
      }
      
      // Sort by timestamp DESC (newest first)
      finalizedRejections.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      // Pagination
      const pageNum = parseInt(page, 10) || 1;
      const pageSizeNum = parseInt(pageSize, 10) || 20;
      const total = finalizedRejections.length;
      const totalPages = Math.ceil(total / pageSizeNum);
      const startIndex = (pageNum - 1) * pageSizeNum;
      const endIndex = startIndex + pageSizeNum;
      const paginatedRejections = finalizedRejections.slice(startIndex, endIndex);
      
      log(`Found ${total} finalized rejections, returning page ${pageNum} of ${totalPages}`);
      
      return reply.status(200).send({
        success: true,
        rejections: paginatedRejections,
        pagination: {
          page: pageNum,
          pageSize: pageSizeNum,
          total,
          totalPages
        }
      });
    } catch (error) {
      log(`Error fetching finalized rejections: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
  */

  // GET /discussions - Get all discussions with pagination, optionally filtered by sectorId or status
  // Returns only summary fields (no messages or full participant data)
  fastify.get('/', async (request, reply) => {
    console.log('[discussions route] GET / route handler called');
    try {
      const { sectorId, status, page = '1', pageSize = '20' } = request.query;

      const pageNum = parseInt(page, 10) || 1;
      const pageSizeNum = parseInt(pageSize, 10) || 20;

      if (sectorId) {
        log(`GET /discussions - Fetching discussions for sectorId: ${sectorId}, status: ${status || 'all'}, page: ${pageNum}, pageSize: ${pageSizeNum}`);
      } else {
        log(`GET /discussions - Fetching all discussions, status: ${status || 'all'}, page: ${pageNum}, pageSize: ${pageSizeNum}`);
      }

      const allDiscussions = await loadDiscussions();

      // Load sectors once to create a map for sector symbols (optimization)
      let sectorMap = new Map();
      try {
        const sectors = await getAllSectors();
        sectors.forEach(sector => {
          if (sector && sector.id) {
            sectorMap.set(sector.id, {
              symbol: sector.symbol || sector.sectorSymbol || 'N/A',
              name: sector.name || sector.sectorName || 'Unknown Sector'
            });
          }
        });
      } catch (sectorError) {
        log(`Warning: Could not load sectors for enrichment: ${sectorError.message}`);
        // Continue without sector enrichment
      }

      // Calculate status counts from all discussions (before filtering)
      // Handle both uppercase and lowercase status values
      // State transitions: OPEN → IN_PROGRESS → DECIDED → CLOSED
      const statusCounts = {
        all: allDiscussions.length,
        in_progress: allDiscussions.filter(d => {
          const status = (d.status || '').toUpperCase();
          // OPEN and IN_PROGRESS are considered "in progress"
          return status === 'IN_PROGRESS' || status === 'OPEN' || status === 'ACTIVE' || 
                 status === 'CREATED' || status === 'IN_PROGRESS';
        }).length,
        decided: allDiscussions.filter(d => {
          const status = (d.status || '').toUpperCase();
          // DECIDED and CLOSED are considered "decided"
          return status === 'DECIDED' || status === 'CLOSED' || status === 'FINALIZED' || 
                 status === 'ACCEPTED' || status === 'COMPLETED' || status === 'ARCHIVED';
        }).length,
      };

      let discussions = allDiscussions;

      // Filter by sectorId if provided
      if (sectorId) {
        discussions = discussions.filter(discussion => discussion.sectorId === sectorId);
        log(`Found ${discussions.length} discussions for sectorId: ${sectorId}`);
      }

      // Filter by status if provided (and not 'all')
      if (status && status !== 'all') {
        if (status === 'decided') {
          // Include all legacy statuses that map to 'decided'
          discussions = discussions.filter(discussion => {
            const s = discussion.status || '';
            return s === 'decided' || s === 'closed' || s === 'CLOSED' || 
                   s === 'finalized' || s === 'accepted' || s === 'completed' ||
                   s === 'archived';
          });
        } else if (status === 'in_progress') {
          // Include all legacy statuses that map to 'in_progress'
          discussions = discussions.filter(discussion => {
            const s = discussion.status || '';
            return s === 'in_progress' || s === 'active' || s === 'open' || 
                   s === 'OPEN' || s === 'created';
          });
        } else {
          discussions = discussions.filter(discussion => discussion.status === status);
        }
        log(`Found ${discussions.length} discussions with status: ${status}`);
      }

      // Sort by newest first (by updatedAt, then createdAt)
      discussions.sort((a, b) => {
        const dateA = new Date(b.updatedAt || b.createdAt || 0).getTime();
        const dateB = new Date(a.updatedAt || a.createdAt || 0).getTime();
        return dateA - dateB;
      });

      // Calculate pagination
      const total = discussions.length;
      const startIndex = (pageNum - 1) * pageSizeNum;
      const endIndex = startIndex + pageSizeNum;
      const paginatedDiscussions = discussions.slice(startIndex, endIndex);

      // Return only summary fields (no messages, no full participant enrichment)
      // Use messagesCount from discussion model (calculated and stored)
      const summaries = paginatedDiscussions.map(discussion => {
        const sectorInfo = discussion.sectorId ? sectorMap.get(discussion.sectorId) : null;
        const agentIds = Array.isArray(discussion.agentIds) ? discussion.agentIds : [];
        // Use messagesCount from model, fallback to messages.length for backward compatibility
        const messageCount = typeof discussion.messagesCount === 'number' 
          ? discussion.messagesCount 
          : (Array.isArray(discussion.messages) ? discussion.messages.length : 0);
        
        // Normalize status to only 'in_progress' or 'decided'
        let normalizedStatus = discussion.status || 'in_progress';
        if (normalizedStatus === 'active' || normalizedStatus === 'open' || normalizedStatus === 'OPEN' || 
            normalizedStatus === 'created' || normalizedStatus === 'in_progress') {
          normalizedStatus = 'in_progress';
        } else if (normalizedStatus === 'closed' || normalizedStatus === 'CLOSED' || 
                   normalizedStatus === 'archived' || normalizedStatus === 'finalized' || 
                   normalizedStatus === 'accepted' || normalizedStatus === 'completed' ||
                   normalizedStatus === 'decided') {
          normalizedStatus = 'decided';
        }
        
        return {
          id: discussion.id,
          title: discussion.title || 'Untitled Discussion',
          sector: sectorInfo?.symbol || 'N/A', // Sector symbol as requested
          sectorId: discussion.sectorId, // Keep for backward compatibility
          status: normalizedStatus,
          updatedAt: discussion.updatedAt || discussion.createdAt || new Date().toISOString(),
          participants: agentIds, // Participants array as requested
          messagesCount: messageCount
        };
      });

      return reply.status(200).send({
        discussions: summaries,
        pagination: {
          page: pageNum,
          pageSize: pageSizeNum,
          total,
          totalPages: Math.ceil(total / pageSizeNum)
        },
        statusCounts
      });
    } catch (error) {
      log(`Error fetching discussions: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Checklist routes removed - checklist functionality has been removed from the system
  // GET /discussions/:id/checklist - REMOVED
  /*
  fastify.get('/:id/checklist', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /discussions/${id}/checklist - Fetching checklist for discussion`);

      const discussions = await loadDiscussions();
      const discussion = discussions.find(d => d.id === id);

      if (!discussion) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      // Validate DECIDED discussion state: Check for pending items
      // HARD RULE: DECIDED discussions CANNOT have pending checklist items
      if (discussion.status === 'DECIDED' || discussion.status === 'decided') {
        try {
          const { fixInconsistentDecidedState } = require('../utils/discussionStatusService');
          await fixInconsistentDecidedState(id);
        } catch (validationError) {
          // If validation fails, return error to client
          const errorMessage = validationError.message || 'Invalid state: DECIDED discussion contains pending checklist items';
          log(`[Discussions Route] Invalid DECIDED state for discussion ${id}: ${errorMessage}`);
          return reply.status(500).send({
            success: false,
            error: errorMessage,
            discussionId: id
          });
        }
      }

      // Get proposed checklist items (from discussion.checklist)
      const rawChecklistItems = Array.isArray(discussion.checklist) ? discussion.checklist : [];
      log(`GET /discussions/${id}/checklist - Found ${rawChecklistItems.length} raw checklist items in discussion.checklist`);
      if (rawChecklistItems.length > 0) {
        log(`GET /discussions/${id}/checklist - Sample checklist item:`, JSON.stringify(rawChecklistItems[0], null, 2));
      }
      
      // Get finalized checklist items (from discussion.finalizedChecklist)
      const finalizedChecklistItems = Array.isArray(discussion.finalizedChecklist) ? discussion.finalizedChecklist : [];
      log(`GET /discussions/${id}/checklist - Found ${finalizedChecklistItems.length} finalized checklist items`);
      
      // Get manager decisions to determine approval status for each proposed item
      const managerDecisions = Array.isArray(discussion.managerDecisions) ? discussion.managerDecisions : [];
      const decisionMap = new Map();
      managerDecisions.forEach(decision => {
        if (decision.item && decision.item.id) {
          decisionMap.set(decision.item.id, {
            approved: decision.approved === true,
            reason: decision.reason || ''
          });
        }
      });

      // Format proposed checklist items with approval status and revision metadata
      // Handle both new strict payload format and legacy format for backward compatibility
      const checklist = rawChecklistItems.map(item => {
        const decision = decisionMap.get(item.id);
        
        // Map new format to old format for backward compatibility
        // New format: sourceAgentId, actionType (uppercase: "BUY", "SELL", "HOLD")
        // Old format: agentId, action (lowercase: "buy", "sell", "hold")
        const agentId = item.sourceAgentId || item.agentId;
        const actionTypeRaw = item.actionType || item.action || item.type;
        // Convert to lowercase for frontend compatibility
        const actionType = typeof actionTypeRaw === 'string' ? actionTypeRaw.toUpperCase() : 'HOLD';
        const action = actionType.toLowerCase(); // Frontend expects lowercase
        const reasoning = item.reasoning || item.reason || item.text || '';
        
        // Generate description from executable payload (for UI display)
        let description = '';
        try {
          if (item.actionType && item.symbol) {
            // New format - generate description using allocationPercent if available
            const allocationPercent = item.allocationPercent !== undefined ? item.allocationPercent : 0;
            description = formatChecklistItemDescription({
              id: item.id,
              sourceAgentId: agentId,
              actionType: actionType,
              symbol: item.symbol,
              amount: item.amount || 0,
              allocationPercent: allocationPercent,
              confidence: item.confidence || 0,
              reasoning: reasoning,
              rationale: item.rationale || reasoning,
              status: item.status || 'PENDING'
            });
          } else {
            // Legacy format - use existing description or generate from available fields
            description = item.description || item.reason || item.reasoning || item.text || '';
          }
        } catch (error) {
          // Fallback to simple description if formatting fails
          description = reasoning || `${actionType} ${item.symbol || ''} - ${reasoning}`;
        }
        
        // Determine approval status from item status or decision
        let approvalStatus = 'pending';
        if (item.status === 'REVISE_REQUIRED') {
          approvalStatus = 'rejected';
        } else if (item.status === 'ACCEPT_REJECTION') {
          approvalStatus = 'accept_rejection';
        } else if (item.status === 'RESUBMITTED') {
          approvalStatus = 'pending'; // RESUBMITTED items are pending re-evaluation
        } else if (item.status === 'APPROVED' || item.status === 'PENDING') {
          approvalStatus = decision ? (decision.approved ? 'accepted' : 'rejected') : 'pending';
        } else if (decision) {
          approvalStatus = decision.approved ? 'accepted' : 'rejected';
        }
        
        return {
          id: item.id,
          description: description,
          action: action, // Lowercase for frontend
          amount: item.amount || 0,
          allocationPercent: item.allocationPercent !== undefined ? item.allocationPercent : 0,
          confidence: item.confidence || 0,
          round: item.round,
          agentId: agentId,
          agentName: item.agentName,
          approvalStatus: approvalStatus,
          approvalReason: decision ? decision.reason : item.managerReason || null,
          // Revision metadata
          status: item.status || 'pending',
          requiresRevision: item.requiresRevision || false,
          managerReason: item.managerReason || null,
          revisionCount: item.revisionCount || 0,
          revisedAt: item.revisedAt || null,
          previousVersions: item.previousVersions || [],
          // Execution metadata
          executedAt: item.executedAt || null,
          executionLogId: item.executionLogId || null,
          // Include new format fields for reference
          symbol: item.symbol,
          sourceAgentId: agentId,
          actionType: actionType, // Uppercase for backend
          reasoning: reasoning,
          rationale: item.rationale || reasoning
        };
      });

      // Format finalized checklist items
      // Handle both new strict payload format and legacy format
      const finalizedChecklist = finalizedChecklistItems.map(item => {
        const agentId = item.sourceAgentId || item.agentId;
        const actionTypeRaw = item.actionType || item.action || item.type;
        // Convert to uppercase for backend, lowercase for frontend
        const actionType = typeof actionTypeRaw === 'string' ? actionTypeRaw.toUpperCase() : 'HOLD';
        const action = actionType.toLowerCase(); // Frontend expects lowercase
        const reasoning = item.reasoning || item.reason || item.text || '';
        
        // Generate description from executable payload
        let description = '';
        try {
          if (item.actionType && item.symbol) {
            const allocationPercent = item.allocationPercent !== undefined ? item.allocationPercent : 0;
            description = formatChecklistItemDescription({
              id: item.id,
              sourceAgentId: agentId,
              actionType: actionType,
              symbol: item.symbol,
              amount: item.amount || 0,
              allocationPercent: allocationPercent,
              confidence: item.confidence || 0,
              reasoning: reasoning,
              rationale: item.rationale || reasoning,
              status: item.status || 'APPROVED'
            });
          } else {
            description = item.description || reasoning;
          }
        } catch (error) {
          description = reasoning || `${actionType} ${item.symbol || ''} - ${reasoning}`;
        }
        
        return {
          id: item.id,
          description: description,
          action: action, // Lowercase for frontend
          amount: item.amount || 0,
          allocationPercent: item.allocationPercent !== undefined ? item.allocationPercent : 0,
          confidence: item.confidence || 0,
          round: item.round,
          agentId: agentId,
          agentName: item.agentName,
          approvalStatus: 'accepted',
          approvedAt: item.approvedAt,
          // Execution metadata
          executedAt: item.executedAt || null,
          executionLogId: item.executionLogId || null,
          // Include new format fields
          symbol: item.symbol,
          sourceAgentId: agentId,
          actionType: actionType, // Uppercase for backend
          reasoning: reasoning,
          rationale: item.rationale || reasoning
        };
      });

      // Find finalizedAt timestamp (use updatedAt when status changed to decided)
      const finalizedAt = discussion.status === 'decided' || discussion.status === 'finalized'
        ? (discussion.updatedAt || discussion.createdAt)
        : null;

      // Create unified checklistItems array (combining both proposed and finalized items)
      // This is the single source of truth for all checklist items
      const checklistItems = [...checklist, ...finalizedChecklist];

      const response = {
        discussionId: id,
        status: discussion.status,
        checklistItems: checklistItems, // Primary field - unified array
        checklist: checklist, // Legacy field - kept for backward compatibility
        finalizedChecklist: finalizedChecklist // Legacy field - kept for backward compatibility
      };

      log(`Found checklist for discussion ${id}: ${checklist.length} proposed items, ${finalizedChecklist.length} finalized items, ${checklistItems.length} total items`);
      if (checklistItems.length > 0) {
        log(`GET /discussions/${id}/checklist - Sample formatted checklist item:`, JSON.stringify(checklistItems[0], null, 2));
      }
      return reply.status(200).send(response);
    } catch (error) {
      log(`Error fetching checklist: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
  */

  // GET /discussions/:id/rejected-items - REMOVED (checklist functionality removed)
  /*
  fastify.get('/:id/rejected-items', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /discussions/${id}/rejected-items - Fetching rejected items for discussion`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      const checklistItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
      
      log(`[REJECTED ITEMS] Discussion ${id}: Checking ${checklistItems.length} checklist items`);
      
      // Filter items that require revision or have been rejected
      // EXCLUDE items with ACCEPT_REJECTION status - these should NOT appear
      const rejectedItems = checklistItems.filter(item => {
        const itemStatus = item.status || '';
        
        // Exclude items that have been accepted (worker accepted the rejection)
        if (itemStatus === 'ACCEPT_REJECTION' || itemStatus === 'accept_rejection') {
          log(`[REJECTED ITEMS] Discussion ${id}: Excluding item ${item.id} - Status is ACCEPT_REJECTION`);
          return false;
        }
        
        // Include items that are in REVISE_REQUIRED status
        if (itemStatus === 'REVISE_REQUIRED' || itemStatus === 'revise_required') {
          log(`[REJECTED ITEMS] Discussion ${id}: Including item ${item.id} - Status is REVISE_REQUIRED`);
          return true;
        }
        
        // Include items that require revision
        if (item.requiresRevision === true) {
          log(`[REJECTED ITEMS] Discussion ${id}: Including item ${item.id} - requiresRevision is true`);
          return true;
        }
        
        // Check manager decisions for rejected items (but exclude if status is ACCEPT_REJECTION)
        const hasRejectedDecision = (discussionRoom.managerDecisions || []).some(decision => 
          decision.item && decision.item.id === item.id && decision.approved === false
        );
        
        if (hasRejectedDecision && itemStatus !== 'ACCEPT_REJECTION' && itemStatus !== 'accept_rejection') {
          log(`[REJECTED ITEMS] Discussion ${id}: Including item ${item.id} - Has rejected manager decision, status=${itemStatus}`);
          return true;
        }
        
        log(`[REJECTED ITEMS] Discussion ${id}: Excluding item ${item.id} - Status=${itemStatus}, requiresRevision=${item.requiresRevision}`);
        return false;
      });
      
      log(`[REJECTED ITEMS] Discussion ${id}: Found ${rejectedItems.length} rejected items after filtering`);

      // Format rejected items with revision metadata
      // Handle both new strict payload format and legacy format
      const formattedRejectedItems = rejectedItems.map(item => {
        const decision = (discussionRoom.managerDecisions || []).find(d => 
          d.item && d.item.id === item.id
        );
        
        const agentId = item.sourceAgentId || item.agentId;
        const actionTypeRaw = item.actionType || item.action || item.type;
        // Convert to uppercase for backend, lowercase for frontend
        const actionType = typeof actionTypeRaw === 'string' ? actionTypeRaw.toUpperCase() : 'HOLD';
        const action = actionType.toLowerCase(); // Frontend expects lowercase
        const reasoning = item.reasoning || item.reason || item.text || '';
        
        // Generate description from executable payload
        let description = '';
        try {
          if (item.actionType && item.symbol && typeof item.amount === 'number') {
            description = formatChecklistItemDescription({
              id: item.id,
              sourceAgentId: agentId,
              actionType: actionType,
              symbol: item.symbol,
              amount: item.amount,
              confidence: item.confidence || 0,
              reasoning: reasoning,
              status: item.status || 'REVISE_REQUIRED'
            });
          } else {
            description = item.description || reasoning;
          }
        } catch (error) {
          description = reasoning || `${actionType} ${item.symbol || ''} - ${reasoning}`;
        }
        
        return {
          id: item.id,
          description: description,
          action: action, // Lowercase for frontend
          amount: item.amount || 0,
          confidence: item.confidence || 0,
          round: item.round,
          agentId: agentId,
          agentName: item.agentName,
          status: item.status || 'REVISE_REQUIRED',
          requiresRevision: item.requiresRevision || true,
          managerReason: item.managerReason || (decision ? decision.reason : null),
          revisionCount: item.revisionCount || 0,
          previousVersions: item.previousVersions || [],
          // Include new format fields
          symbol: item.symbol,
          sourceAgentId: agentId,
          actionType: actionType,
          reasoning: reasoning
        };
      });

      log(`Found ${formattedRejectedItems.length} rejected items for discussion ${id}`);
      return reply.status(200).send({
        success: true,
        discussionId: id,
        rejectedItems: formattedRejectedItems
      });
    } catch (error) {
      log(`Error fetching rejected items: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Checklist endpoints removed - checklist functionality has been removed from the system
  // POST /discussions/:id/submit-revision - REMOVED
  /*
  fastify.post('/:id/submit-revision', async (request, reply) => {
    try {
      const { id } = request.params;
      const { itemId, newContent } = request.body;

      if (!itemId) {
        return reply.status(400).send({
          success: false,
          error: 'itemId is required'
        });
      }

      if (!newContent || (typeof newContent !== 'object')) {
        return reply.status(400).send({
          success: false,
          error: 'newContent object is required with fields: action, amount, reason (or reasoning), confidence'
        });
      }

      log(`POST /discussions/${id}/submit-revision - Submitting revision for item ${itemId}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      const checklistItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
      
      // Find the item to revise
      const itemIndex = checklistItems.findIndex(item => item.id === itemId);
      if (itemIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Checklist item not found'
        });
      }

      const item = checklistItems[itemIndex];
      
      // Verify item is in REVISE_REQUIRED status
      if (item.status !== 'REVISE_REQUIRED' && !item.requiresRevision) {
        return reply.status(400).send({
          success: false,
          error: 'Item is not in REVISE_REQUIRED status'
        });
      }

      // Initialize previousVersions array if not present
      if (!item.previousVersions) {
        item.previousVersions = [];
      }

      // Store current version in previousVersions before updating
      item.previousVersions.push({
        action: item.action,
        amount: item.amount,
        reason: item.reason || item.reasoning || '',
        confidence: item.confidence,
        timestamp: new Date().toISOString()
      });

      // Increment revision count
      item.revisionCount = (item.revisionCount || 0) + 1;

      // ENFORCEMENT: Prevent agents from setting status to APPROVED/REJECTED
      // Only managers can set these statuses
      if (newContent.status) {
        const requestedStatus = (newContent.status || '').toUpperCase();
        if (requestedStatus === 'APPROVED' || requestedStatus === 'REJECTED') {
          const { agentId } = request.body;
          logViolation(agentId || 'unknown', itemId, `SET_STATUS_${requestedStatus}`, `POST /discussions/${id}/submit-revision`);
          return reply.status(403).send({
            success: false,
            error: `Unauthorized: Only manager agents can set checklist item status to ${requestedStatus}. Agents may only revise proposals.`
          });
        }
      }

      // Update item with new content
      if (newContent.action !== undefined) item.action = newContent.action;
      if (newContent.amount !== undefined) item.amount = newContent.amount;
      if (newContent.reason !== undefined) item.reason = newContent.reason;
      if (newContent.reasoning !== undefined) {
        item.reasoning = newContent.reasoning;
        if (!item.reason) item.reason = newContent.reasoning;
      }
      if (newContent.confidence !== undefined) item.confidence = newContent.confidence;

      // Set status to RESUBMITTED after worker revision
      // ENFORCEMENT: Status is hardcoded - agents cannot change it to APPROVED/REJECTED
      item.status = 'RESUBMITTED';
      item.requiresRevision = false;
      item.requiresManagerEvaluation = true;
      // Keep managerReason for reference so workers can see why it was rejected

      // Update the item in checklist
      checklistItems[itemIndex] = item;
      discussionRoom.checklist = checklistItems;

      // Update manager decision for this item to null (will be re-evaluated)
      if (Array.isArray(discussionRoom.managerDecisions)) {
        const decisionIndex = discussionRoom.managerDecisions.findIndex(d => 
          d.item && d.item.id === itemId
        );
        if (decisionIndex !== -1) {
          // Remove old decision - it will be re-evaluated
          discussionRoom.managerDecisions.splice(decisionIndex, 1);
        }
      }

      // Check if all items are now resolved
      const allItemsResolved = checklistItems.every(item => 
        item.status === 'APPROVED' || item.status === 'ACCEPT_REJECTION' ||
        (discussionRoom.managerDecisions || []).some(decision => 
          decision.item && decision.item.id === item.id && decision.approved === true
        )
      );
      
      // Save discussion first
      await saveDiscussion(discussionRoom);
      
      // State machine refactored: No automatic transitions
      // Transitions are now explicit: IN_PROGRESS → DECIDED
      // Status remains IN_PROGRESS until explicitly transitioned to DECIDED

      log(`Revision submitted for item ${itemId} in discussion ${id}. Revision count: ${item.revisionCount}`);
      return reply.status(200).send({
        success: true,
        discussionId: id,
        itemId: itemId,
        item: {
          id: item.id,
          action: item.actionType || item.action || item.type,
          actionType: item.actionType || item.action || item.type,
          amount: item.amount,
          reason: item.reasoning || item.reason,
          reasoning: item.reasoning || item.reason,
          confidence: item.confidence,
          status: item.status,
          revisionCount: item.revisionCount,
          symbol: item.symbol,
          sourceAgentId: item.sourceAgentId || item.agentId
        },
        allItemsResolved: allItemsResolved
      });
    } catch (error) {
      log(`Error submitting revision: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
  */

  // POST /discussions/:id/accept-rejection - REMOVED (checklist functionality removed)
  /*
  fastify.post('/:id/accept-rejection', async (request, reply) => {
    try {
      const { id } = request.params;
      const { itemId } = request.body;

      if (!itemId) {
        return reply.status(400).send({
          success: false,
          error: 'itemId is required'
        });
      }

      log(`POST /discussions/${id}/accept-rejection - Accepting rejection for item ${itemId}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      const checklistItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
      
      // Find the item
      const itemIndex = checklistItems.findIndex(item => item.id === itemId);
      if (itemIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Checklist item not found'
        });
      }

      const item = checklistItems[itemIndex];
      
      log(`[ACCEPT REJECTION] Discussion ${id}: Item ${itemId} current status: ${item.status}, requiresRevision: ${item.requiresRevision}`);
      
      // Verify item is in REVISE_REQUIRED status
      if (item.status !== 'REVISE_REQUIRED' && !item.requiresRevision) {
        log(`[ACCEPT REJECTION] Discussion ${id}: Item ${itemId} is not in REVISE_REQUIRED status. Current: ${item.status}`);
        return reply.status(400).send({
          success: false,
          error: 'Item is not in REVISE_REQUIRED status'
        });
      }

      // Change status to ACCEPT_REJECTION
      const previousStatus = item.status;
      item.status = 'ACCEPT_REJECTION';
      item.requiresRevision = false;

      log(`[ACCEPT REJECTION] Discussion ${id}: Item ${itemId} status changed from ${previousStatus} to ACCEPT_REJECTION`);

      // Update the item in checklist
      checklistItems[itemIndex] = item;
      discussionRoom.checklist = checklistItems;

      // Update manager decision to reflect acceptance of rejection
      if (Array.isArray(discussionRoom.managerDecisions)) {
        const decisionIndex = discussionRoom.managerDecisions.findIndex(d => 
          d.item && d.item.id === itemId
        );
        if (decisionIndex !== -1) {
          discussionRoom.managerDecisions[decisionIndex].approved = false;
          discussionRoom.managerDecisions[decisionIndex].reason = 
            (discussionRoom.managerDecisions[decisionIndex].reason || '') + 
            ' (Worker accepted rejection)';
          log(`[ACCEPT REJECTION] Discussion ${id}: Updated manager decision for item ${itemId}`);
        } else {
          log(`[ACCEPT REJECTION] Discussion ${id}: No manager decision found for item ${itemId}`);
        }
      }

      // Check if all items are now resolved (APPROVED or ACCEPT_REJECTION)
      const allItemsResolved = checklistItems.every(item => 
        item.status === 'APPROVED' || item.status === 'ACCEPT_REJECTION' ||
        (discussionRoom.managerDecisions || []).some(decision => 
          decision.item && decision.item.id === item.id && decision.approved === true
        )
      );
      
      // Log item statuses for debugging
      const itemStatuses = checklistItems.map(item => ({
        id: item.id,
        status: item.status,
        requiresRevision: item.requiresRevision
      }));
      log(`[ACCEPT REJECTION] Discussion ${id}: All items statuses:`, JSON.stringify(itemStatuses, null, 2));
      
      // Update discussion status if all items are resolved
      // Save discussion first
      await saveDiscussion(discussionRoom);
      
      // State machine refactored: No automatic transitions
      // Transitions are now explicit: IN_PROGRESS → DECIDED

      log(`[ACCEPT REJECTION] Discussion ${id}: Rejection accepted for item ${itemId}. All items resolved: ${allItemsResolved}, Discussion status: ${discussionRoom.status}`);
      return reply.status(200).send({
        success: true,
        discussionId: id,
        itemId: itemId,
        item: {
          id: item.id,
          status: item.status
        },
        allItemsResolved: allItemsResolved,
        discussionStatus: discussionRoom.status
      });
    } catch (error) {
      log(`Error accepting rejection: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
  */

  // POST /discussions/:id/items/:itemId/revise - REMOVED (checklist functionality removed)
  /*
  fastify.post('/:id/items/:itemId/revise', async (request, reply) => {
    try {
      const { id, itemId } = request.params;
      const { newContent } = request.body;

      if (!itemId) {
        return reply.status(400).send({
          success: false,
          error: 'itemId is required'
        });
      }

      if (!newContent || (typeof newContent !== 'object')) {
        return reply.status(400).send({
          success: false,
          error: 'newContent object is required with fields: action, amount, reason (or reasoning), confidence'
        });
      }

      log(`POST /discussions/${id}/items/${itemId}/revise - Submitting revision for item ${itemId}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      const checklistItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
      
      // Find the item to revise
      const itemIndex = checklistItems.findIndex(item => item.id === itemId);
      if (itemIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Checklist item not found'
        });
      }

      const item = checklistItems[itemIndex];
      
      // Verify item is in REVISE_REQUIRED status
      if (item.status !== 'REVISE_REQUIRED' && !item.requiresRevision) {
        return reply.status(400).send({
          success: false,
          error: 'Item is not in REVISE_REQUIRED status'
        });
      }

      // Initialize previousVersions array if not present
      if (!item.previousVersions) {
        item.previousVersions = [];
      }

      // Store current version in previousVersions before updating
      item.previousVersions.push({
        action: item.action,
        amount: item.amount,
        reason: item.reason || item.reasoning || '',
        confidence: item.confidence,
        timestamp: new Date().toISOString()
      });

      // Increment revision count
      item.revisionCount = (item.revisionCount || 0) + 1;

      // ENFORCEMENT: Prevent agents from setting status to APPROVED/REJECTED
      // Only managers can set these statuses
      if (newContent.status) {
        const requestedStatus = (newContent.status || '').toUpperCase();
        if (requestedStatus === 'APPROVED' || requestedStatus === 'REJECTED') {
          const { agentId } = request.body;
          logViolation(agentId || 'unknown', itemId, `SET_STATUS_${requestedStatus}`, `POST /discussions/${id}/items/${itemId}/revise`);
          return reply.status(403).send({
            success: false,
            error: `Unauthorized: Only manager agents can set checklist item status to ${requestedStatus}. Agents may only revise proposals.`
          });
        }
      }

      // Update item with new content
      if (newContent.action !== undefined) item.action = newContent.action;
      if (newContent.amount !== undefined) item.amount = newContent.amount;
      if (newContent.reason !== undefined) item.reason = newContent.reason;
      if (newContent.reasoning !== undefined) {
        item.reasoning = newContent.reasoning;
        if (!item.reason) item.reason = newContent.reasoning;
      }
      if (newContent.confidence !== undefined) item.confidence = newContent.confidence;

      // Set status to RESUBMITTED after worker revision
      // ENFORCEMENT: Status is hardcoded - agents cannot change it to APPROVED/REJECTED
      item.status = 'RESUBMITTED';
      item.requiresRevision = false;
      item.requiresManagerEvaluation = true;
      // Keep managerReason for reference so workers can see why it was rejected

      // Update the item in checklist
      checklistItems[itemIndex] = item;
      discussionRoom.checklist = checklistItems;

      // Update manager decision for this item to null (will be re-evaluated)
      if (Array.isArray(discussionRoom.managerDecisions)) {
        const decisionIndex = discussionRoom.managerDecisions.findIndex(d => 
          d.item && d.item.id === itemId
        );
        if (decisionIndex !== -1) {
          // Remove old decision - it will be re-evaluated
          discussionRoom.managerDecisions.splice(decisionIndex, 1);
        }
      }

      // Check if all items are now resolved
      const allItemsResolved = checklistItems.every(item => 
        item.status === 'APPROVED' || item.status === 'ACCEPT_REJECTION' ||
        (discussionRoom.managerDecisions || []).some(decision => 
          decision.item && decision.item.id === item.id && decision.approved === true
        )
      );
      
      // Save discussion first
      await saveDiscussion(discussionRoom);
      
      // State machine refactored: No automatic transitions
      // Transitions are now explicit: IN_PROGRESS → DECIDED
      // Status remains IN_PROGRESS until explicitly transitioned to DECIDED

      log(`Revision submitted for item ${itemId} in discussion ${id}. Revision count: ${item.revisionCount}`);
      return reply.status(200).send({
        success: true,
        discussionId: id,
        itemId: itemId,
        item: {
          id: item.id,
          action: item.actionType || item.action || item.type,
          actionType: item.actionType || item.action || item.type,
          amount: item.amount,
          reason: item.reasoning || item.reason,
          reasoning: item.reasoning || item.reason,
          confidence: item.confidence,
          status: item.status,
          revisionCount: item.revisionCount,
          requiresManagerEvaluation: item.requiresManagerEvaluation,
          symbol: item.symbol,
          sourceAgentId: item.sourceAgentId || item.agentId
        },
        allItemsResolved: allItemsResolved
      });
    } catch (error) {
      log(`Error submitting revision: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
  */

  // POST /discussions/:id/items/:itemId/accept-rejection - REMOVED (checklist functionality removed)
  /*
  fastify.post('/:id/items/:itemId/accept-rejection', async (request, reply) => {
    try {
      const { id, itemId } = request.params;

      if (!itemId) {
        return reply.status(400).send({
          success: false,
          error: 'itemId is required'
        });
      }

      log(`POST /discussions/${id}/items/${itemId}/accept-rejection - Accepting rejection for item ${itemId}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      const checklistItems = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
      
      // Find the item
      const itemIndex = checklistItems.findIndex(item => item.id === itemId);
      if (itemIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Checklist item not found'
        });
      }

      const item = checklistItems[itemIndex];
      
      log(`[ACCEPT REJECTION] Discussion ${id}: Item ${itemId} current status: ${item.status}, requiresRevision: ${item.requiresRevision}`);
      
      // Verify item is in REVISE_REQUIRED status
      if (item.status !== 'REVISE_REQUIRED' && !item.requiresRevision) {
        log(`[ACCEPT REJECTION] Discussion ${id}: Item ${itemId} is not in REVISE_REQUIRED status. Current: ${item.status}`);
        return reply.status(400).send({
          success: false,
          error: 'Item is not in REVISE_REQUIRED status'
        });
      }

      // Change status to ACCEPT_REJECTION (FINAL)
      const previousStatus = item.status;
      item.status = 'ACCEPT_REJECTION';
      item.requiresRevision = false;
      item.requiresManagerEvaluation = false;

      log(`[ACCEPT REJECTION] Discussion ${id}: Item ${itemId} status changed from ${previousStatus} to ACCEPT_REJECTION`);

      // Update the item in checklist
      checklistItems[itemIndex] = item;
      discussionRoom.checklist = checklistItems;
      
      // Mark refinement cycle as resolved (item accepted rejection)
      if (Array.isArray(discussionRoom.activeRefinementCycles)) {
        const cycleIndex = discussionRoom.activeRefinementCycles.findIndex(
          cycle => cycle.itemId === itemId
        );
        if (cycleIndex !== -1) {
          // Remove from active cycles since it's resolved
          discussionRoom.activeRefinementCycles.splice(cycleIndex, 1);
          log(`[ACCEPT REJECTION] Discussion ${id}: Removed item ${itemId} from active refinement cycles`);
        }
      }

      // Update manager decision to reflect acceptance of rejection
      if (Array.isArray(discussionRoom.managerDecisions)) {
        const decisionIndex = discussionRoom.managerDecisions.findIndex(d => 
          d.item && d.item.id === itemId
        );
        if (decisionIndex !== -1) {
          discussionRoom.managerDecisions[decisionIndex].approved = false;
          discussionRoom.managerDecisions[decisionIndex].reason = 
            (discussionRoom.managerDecisions[decisionIndex].reason || '') + 
            ' (Worker accepted rejection)';
          log(`[ACCEPT REJECTION] Discussion ${id}: Updated manager decision for item ${itemId}`);
        } else {
          log(`[ACCEPT REJECTION] Discussion ${id}: No manager decision found for item ${itemId}`);
        }
      }

      // Check if all items are now resolved (APPROVED or ACCEPT_REJECTION)
      const allItemsResolved = checklistItems.every(item => 
        item.status === 'APPROVED' || item.status === 'ACCEPT_REJECTION' ||
        (discussionRoom.managerDecisions || []).some(decision => 
          decision.item && decision.item.id === item.id && decision.approved === true
        )
      );
      
      // Log item statuses for debugging
      const itemStatuses = checklistItems.map(item => ({
        id: item.id,
        status: item.status,
        requiresRevision: item.requiresRevision
      }));
      log(`[ACCEPT REJECTION] Discussion ${id}: All items statuses:`, JSON.stringify(itemStatuses, null, 2));
      
      // Update discussion status if all items are resolved
      // Save discussion first
      await saveDiscussion(discussionRoom);
      
      // State machine refactored: No automatic transitions
      // Transitions are now explicit: IN_PROGRESS → DECIDED

      log(`[ACCEPT REJECTION] Discussion ${id}: Rejection accepted for item ${itemId}. All items resolved: ${allItemsResolved}, Discussion status: ${discussionRoom.status}`);
      return reply.status(200).send({
        success: true,
        discussionId: id,
        itemId: itemId,
        item: {
          id: item.id,
          status: item.status
        },
        allItemsResolved: allItemsResolved,
        discussionStatus: discussionRoom.status
      });
    } catch (error) {
      log(`Error accepting rejection: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
  */

  // GET /discussions/:id/messages - Get messages for a specific discussion
  fastify.get('/:id/messages', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /discussions/${id}/messages - Fetching messages for discussion: ${id}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      // Enrich messages with agent names
      const enriched = await enrichDiscussion(discussionData);
      
      log(`Found ${enriched.messages.length} messages for discussion: ${id}`);
      return reply.status(200).send({
        messages: enriched.messages || []
      });
    } catch (error) {
      log(`Error fetching messages: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /discussions/:id - Get a single discussion by id
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /discussions/${id} - Fetching discussion by ID`);

      const discussions = await loadDiscussions();
      const discussion = discussions.find(d => d.id === id);

      if (!discussion) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      // CHECKLIST GUARD: Validate discussion data
      validateNoChecklist(discussion, `GET /discussions/:id (${id})`, true);

      // Validate DECIDED discussion state: Check for pending items
      // HARD RULE: DECIDED discussions CANNOT have pending checklist items
      if (discussion.status === 'DECIDED' || discussion.status === 'decided') {
        try {
          const { fixInconsistentDecidedState } = require('../utils/discussionStatusService');
          await fixInconsistentDecidedState(id);
        } catch (validationError) {
          // If validation fails, return error to client
          const errorMessage = validationError.message || 'Invalid state: DECIDED discussion contains pending checklist items';
          log(`[Discussions Route] Invalid DECIDED state for discussion ${id}: ${errorMessage}`);
          return reply.status(500).send({
            success: false,
            error: errorMessage,
            discussionId: id
          });
        }
      }
      
      const enriched = await enrichDiscussion(discussion);
      log(`Found discussion - ID: ${enriched.id}, Title: ${enriched.title}, Status: ${enriched.status}, Messages: ${enriched.messages?.length || 0}`);
      
      // Auto-start rounds if discussion is OPEN and has no messages
      if ((enriched.status === 'OPEN' || enriched.status === 'open' || enriched.status === 'IN_PROGRESS' || enriched.status === 'in_progress') && (!enriched.messages || enriched.messages.length === 0)) {
        log(`Auto-starting rounds for discussion ${id} (status: ${enriched.status}, messages: ${enriched.messages?.length || 0})`);
        // Start rounds in background (fire and forget)
        const DiscussionEngine = require('../core/DiscussionEngine');
        const discussionEngine = new DiscussionEngine();
        setImmediate(() => {
          discussionEngine.startRounds(id, 2).catch(error => { // Reduced to 2 rounds for faster lifecycle
            console.error(`[Discussions Route] Error auto-starting rounds for discussion ${id}:`, error);
            console.error(`[Discussions Route] Error stack:`, error.stack);
          });
        });
      }
      
      return reply.status(200).send(enriched);
    } catch (error) {
      log(`Error fetching discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /discussions - Create a new discussion
  fastify.post('/', async (request, reply) => {
    try {
      // CHECKLIST GUARD: Validate request body
      validateNoChecklist(request.body, 'POST /discussions (request.body)');
      
      const { sectorId, title, agentIds } = request.body;

      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required'
        });
      }

      log(`POST /discussions - Creating discussion with sectorId: ${sectorId}, title: ${title || 'auto-generated'}`);

      // Use ManagerEngine.createDiscussion to ensure all validations are performed:
      // 1. No active discussions in the sector
      // 2. All participating agents (non-manager) have confidence >= 65
      // 3. Sector balance > 0
      const ManagerEngine = require('../core/ManagerEngine');
      const managerEngine = new ManagerEngine();
      const result = await managerEngine.createDiscussion(sectorId);

      if (!result.created || !result.discussion) {
        const errorMsg = result.discussion 
          ? `Cannot create discussion: There is already a non-closed discussion for this sector`
          : `Cannot create discussion: Validation failed (check logs for details)`;
        log(`Failed to create discussion: ${errorMsg}`);
        return reply.status(400).send({
          success: false,
          error: errorMsg
        });
      }

      const enriched = await enrichDiscussion(result.discussion.toJSON());

      log(`Discussion created successfully - ID: ${enriched.id}, Title: ${enriched.title}`);

      return reply.status(201).send(enriched);
    } catch (error) {
      log(`Error creating discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /discussions/:id/message - Add a message to a discussion
  fastify.post('/:id/message', async (request, reply) => {
    try {
      // CHECKLIST GUARD: Validate request body
      validateNoChecklist(request.body, 'POST /discussions/:id/message (request.body)');
      
      const { id } = request.params;
      const { agentId, content, role, agentName } = request.body;

      if (!agentId || !content) {
        return reply.status(400).send({
          success: false,
          error: 'agentId and content are required'
        });
      }

      log(`POST /discussions/${id}/message - Adding message to discussion: ${id}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);

      // Ensure checklist array exists
      if (!Array.isArray(discussionRoom.checklist)) {
        discussionRoom.checklist = [];
      }

      // Add message (validation happens inside addMessage)
      const messageAdded = discussionRoom.addMessage({ 
        agentId, 
        content, 
        role: role || 'agent',
        agentName: agentName || undefined
      });

      // If message validation failed, return error without saving
      if (!messageAdded) {
        log(`Message validation failed for discussion: ${id}, agent: ${agentId}`);
        return reply.status(400).send({
          success: false,
          error: 'Message validation failed: message must include symbol, confidence, and reasoning'
        });
      }

      // Create checklist item from structured proposal object if provided
      // Checklist items MUST ONLY be created from structured proposal objects, never from message text
      const { proposal } = request.body;
      
      if (proposal && typeof proposal === 'object') {
        // GUARDRAIL: Ensure checklist creation is attempted exactly once per agent per round
        const currentRound = discussionRoom.currentRound || discussionRoom.round || 1;
        
        // Check if agent already has a checklist item for this round (prevent duplicates)
        if (discussionRoom.hasChecklistItemForRound(agentId, currentRound)) {
          console.log(`[POST /discussions/:id/message] Round ${currentRound}: Agent ${agentId} already has a checklist item for this round, skipping duplicate creation`);
        } else if (discussionRoom.hasAttemptedChecklistCreation(agentId, currentRound)) {
          console.log(`[POST /discussions/:id/message] Round ${currentRound}: Agent ${agentId} has already attempted checklist creation for this round, skipping`);
        } else {
          // Mark that we're attempting checklist creation for this agent in this round
          discussionRoom.markChecklistCreationAttempt(agentId, currentRound);
          console.log(`[POST /discussions/:id/message] Round ${currentRound}: Attempting checklist creation for agent ${agentId}`);

          try {
            // CONFIDENCE GATING: Check if agent has sufficient confidence to create checklist items
            // Agents with confidence < 65 can post analysis messages but cannot create checklist items
            const agents = await loadAgents();
            const agent = agents.find(a => a && a.id === agentId);
            
            if (agent) {
              const agentConfidence = extractConfidence(agent, 0);
              if (agentConfidence < 65) {
                console.log(`[POST /discussions/:id/message] Round ${currentRound}: Agent ${agentId} has confidence ${agentConfidence.toFixed(2)} < 65. Skipping checklist item creation. Agent may still post analysis messages.`);
                // Continue to save the message even though checklist creation is skipped
              } else {
                // Agents no longer generate checklist items
                // They only provide reasoning + proposal text + confidence
                console.log(`[discussions] Agent ${agentId} provided reasoning with proposal (no checklist item created)`);
                console.log(`[discussions] Proposal details:`, {
                  confidence: proposal?.confidence,
                  hasReasoning: !!proposal?.reasoning,
                  hasProposal: !!proposal?.proposal
                });
              }
            } else {
              console.warn(`[POST /discussions/:id/message] Agent ${agentId} not found.`);
            }
          } catch (error) {
            console.error(`[POST /discussions/:id/message] Error processing proposal for agent ${agentId}:`, error);
            // Continue execution - don't block message saving if proposal processing fails
          }
        }
      } else {
        // No proposal object provided - cannot create checklist item
        // This is expected for manually posted messages without structured proposals
        console.log(`[POST /discussions/:id/message] No proposal object provided in request body. Skipping checklist item creation.`);
      }

      // Ensure status is IN_PROGRESS if it was CREATED
      const currentStatus = (discussionRoom.status || '').toUpperCase();
      if (currentStatus === 'CREATED') {
        await transitionStatus(id, STATUS.IN_PROGRESS, 'First message added');
      }

      // After auto-evaluation, check if discussion can close
      try {
        const ManagerEngine = require('../core/ManagerEngine');
        const managerEngine = new ManagerEngine();
        
        // Check if all items are terminal and discussion can close
        if (managerEngine.canDiscussionClose(discussionRoom)) {
          log(`[POST /discussions/:id/message] Discussion ${id} can close. All items are terminal.`);
          
          // Save final round snapshot
          const currentRound = discussionRoom.currentRound || discussionRoom.round || 1;
          if (!Array.isArray(discussionRoom.roundHistory)) {
            discussionRoom.roundHistory = [];
          }
          
          const finalRoundSnapshot = {
            round: currentRound,
            checklist: JSON.parse(JSON.stringify(discussionRoom.checklist || [])),
            finalizedChecklist: JSON.parse(JSON.stringify(discussionRoom.finalizedChecklist || [])),
            managerDecisions: JSON.parse(JSON.stringify(discussionRoom.managerDecisions || [])),
            messages: JSON.parse(JSON.stringify(discussionRoom.messages || [])),
            timestamp: new Date().toISOString()
          };
          
          discussionRoom.roundHistory.push(finalRoundSnapshot);
          await saveDiscussion(discussionRoom);
          
          // State machine refactored: No automatic transitions
          // Transitions are now explicit: IN_PROGRESS → DECIDED
        }
      } catch (closeError) {
        log(`[POST /discussions/:id/message] Error checking if discussion can close: ${closeError.message}`);
        // Continue with normal flow if check fails
      }

      await saveDiscussion(discussionRoom);

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Message added successfully to discussion: ${id}`);

      return reply.status(200).send(enriched);
    } catch (error) {
      log(`Error adding message: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // DELETE /discussions/:id - Delete a discussion
  // This must come before other /:id/* routes to avoid route conflicts
  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`DELETE /discussions/${id} - Deleting discussion: ${id}`);

      // Check if discussion exists
      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      // Remove discussion ID from sector's discussions array
      const sectorId = discussionData.sectorId;
      if (sectorId) {
        try {
          const sector = await getSectorById(sectorId);
          if (sector && Array.isArray(sector.discussions)) {
            const updatedDiscussions = sector.discussions.filter(discId => discId !== id);
            await updateSector(sectorId, {
              discussions: updatedDiscussions
            });
            log(`Removed discussion ${id} from sector ${sectorId}`);
          }
        } catch (sectorError) {
          log(`Warning: Could not update sector ${sectorId}: ${sectorError.message}`);
          // Continue with deletion even if sector update fails
        }
      }

      // Delete the discussion
      await deleteDiscussion(id);

      log(`Discussion deleted successfully: ${id}`);

      return reply.status(200).send({
        success: true,
        message: `Discussion ${id} deleted successfully`
      });
    } catch (error) {
      log(`Error deleting discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /discussions/:id/close - Close discussion (manager-controlled)
  // Closes discussion ONLY when all checklist items are resolved:
  // - No items in 'PENDING' or 'REVISE_REQUIRED'
  // - All items are either 'APPROVED' or 'ACCEPT_REJECTION'
  // Sets status to 'CLOSED', saves finalRound to roundHistory, records discussionClosedAt
  fastify.post('/:id/close', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/close - Closing discussion (manager-controlled): ${id}`);

      const discussionRoom = await closeDiscussion(id);

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Discussion closed successfully: ${id}`);

      return reply.status(200).send(enriched);
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      log(`Error closing discussion: ${errorMessage}`);
      return reply.status(500).send({
        success: false,
        error: errorMessage
      });
    }
  });

  // POST /discussions/:id/archive - Mark discussion as decided
  // Discussions can only be 'in_progress' or 'decided', so this marks it as 'decided'
  fastify.post('/:id/archive', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/archive - Marking discussion as decided: ${id}`);

      const discussionRoom = await archiveDiscussion(id);

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Discussion marked as decided successfully: ${id}`);

      return reply.status(200).send(enriched);
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      log(`Error marking discussion as decided: ${errorMessage}`);
      return reply.status(500).send({
        success: false,
        error: errorMessage
      });
    }
  });

  // POST /discussions/:id/accept - REMOVED (approval functionality removed)
  /*
  fastify.post('/:id/accept', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/accept - Accepting discussion: ${id}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      
      // Validate: Discussion must have approved checklist items to be accepted
      // Accepted discussions mean approved checklist items that the manager will execute
      const finalizedChecklist = Array.isArray(discussionRoom.finalizedChecklist) ? discussionRoom.finalizedChecklist : [];
      const checklist = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];
      
      // Check if there are any checklist items at all
      if (checklist.length === 0) {
        log(`Discussion ${id} cannot be accepted: No checklist items found`);
        return reply.status(400).send({
          success: false,
          error: 'Discussion cannot be accepted: No checklist items found. Discussions must have checklist items to be approved for execution.'
        });
      }
      
      // Check if there are approved items in finalizedChecklist
      if (finalizedChecklist.length === 0) {
        log(`Discussion ${id} cannot be accepted: No approved checklist items found`);
        return reply.status(400).send({
          success: false,
          error: 'Discussion cannot be accepted: No approved checklist items found. The manager must approve checklist items before the discussion can be accepted for execution.'
        });
      }
      
      // Discussion has approved checklist items - can be accepted
      // Execution happens automatically when items transition to APPROVED status
      // No need to execute here - items are already executed when they were approved
      
      // State machine refactored: No automatic transitions
      // Transitions are now explicit: IN_PROGRESS → DECIDED

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Discussion accepted successfully: ${id} with ${finalizedChecklist.length} approved checklist items executed`);

      return reply.status(200).send(enriched);
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      log(`Error accepting discussion: ${errorMessage}`);
      return reply.status(500).send({
        success: false,
        error: errorMessage
      });
    }
  });
  */

  // POST /discussions/:id/reject - REMOVED (approval functionality removed)
  /*
  fastify.post('/:id/reject', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/reject - Marking discussion as completed: ${id}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      // Individual checklist items are classified as 'accepted' or 'rejected', not discussions
      // State machine refactored: No automatic transitions
      // Transitions are now explicit: IN_PROGRESS → DECIDED

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Discussion marked as completed successfully: ${id}`);

      return reply.status(200).send(enriched);
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      log(`Error marking discussion as completed: ${errorMessage}`);
      return reply.status(500).send({
        success: false,
        error: errorMessage
      });
    }
  });
  */

  // POST /discussions/:id/collect-arguments - Manually trigger argument collection
  fastify.post('/:id/collect-arguments', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/collect-arguments - Collecting arguments for discussion: ${id}`);

      const arguments = await collectArguments(id);
      const discussionData = await findDiscussionById(id);
      const enriched = await enrichDiscussion(discussionData);

      log(`Arguments collected successfully: ${arguments.length} arguments`);

      return reply.status(200).send({
        success: true,
        arguments: arguments,
        discussion: enriched
      });
    } catch (error) {
      log(`Error collecting arguments: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /discussions/:id/produce-decision - Manually trigger decision production
  fastify.post('/:id/produce-decision', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/produce-decision - Producing decision for discussion: ${id}`);

      const decision = await produceDecision(id);
      const discussionData = await findDiscussionById(id);
      const enriched = await enrichDiscussion(discussionData);

      log(`Decision produced successfully: ${decision.action} (confidence: ${decision.confidence})`);

      return reply.status(200).send({
        success: true,
        decision: decision,
        discussion: enriched
      });
    } catch (error) {
      log(`Error producing decision: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /discussions/start - Start a new discussion for a sector
  // Multi-round: Creates a discussion with status 'OPEN'
  fastify.post('/start', async (request, reply) => {
    try {
      const { sectorId } = request.body;

      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required'
        });
      }

      log(`POST /discussions/start - Starting discussion for sector ${sectorId}`);

      const DiscussionEngine = require('../core/DiscussionEngine');
      const discussionEngine = new DiscussionEngine();
      const discussion = await discussionEngine.startDiscussionById(sectorId);

      const enriched = await enrichDiscussion(discussion.toJSON());

      return reply.status(201).send({
        success: true,
        discussion: enriched
      });
    } catch (error) {
      log(`Error starting discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /discussions/:id/start-rounds - Manually trigger rounds for an existing discussion
  fastify.post('/:id/start-rounds', async (request, reply) => {
    try {
      const { id } = request.params;
      const { numRounds } = request.body || {};

      if (!id) {
        return reply.status(400).send({
          success: false,
          error: 'Discussion ID is required'
        });
      }

      log(`POST /discussions/${id}/start-rounds - Starting rounds for discussion ${id}`);

      const DiscussionEngine = require('../core/DiscussionEngine');
      const discussionEngine = new DiscussionEngine();
      
      await discussionEngine.startRounds(id, numRounds || 2); // Default reduced to 2 rounds for faster lifecycle

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const enriched = await enrichDiscussion(discussionData);

      return reply.status(200).send({
        success: true,
        message: `Started ${numRounds || 2} rounds for discussion`,
        discussion: enriched
      });
    } catch (error) {
      log(`Error starting rounds: ${error.message}`);
      console.error('Error starting rounds:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // POST /discussions/:id/submit-checklist-round - REMOVED (checklist functionality removed)
  /*
  fastify.post('/:id/submit-checklist-round', async (request, reply) => {
    try {
      const { id } = request.params;
      const { checklistItems } = request.body;

      if (!checklistItems || !Array.isArray(checklistItems)) {
        return reply.status(400).send({
          success: false,
          error: 'checklistItems array is required'
        });
      }

      log(`POST /discussions/${id}/submit-checklist-round - Submitting ${checklistItems.length} checklist items`);

      const DiscussionEngine = require('../core/DiscussionEngine');
      const discussionEngine = new DiscussionEngine();
      const discussion = await discussionEngine.submitChecklistRound(id, checklistItems);

      const enriched = await enrichDiscussion(discussion.toJSON());

      return reply.status(200).send({
        success: true,
        discussion: enriched
      });
    } catch (error) {
      log(`Error submitting checklist round: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
  */

  // POST /discussions/:id/advance-round - Advance discussion to next round
  // Multi-round: Increments currentRound, saves snapshot to roundHistory
  fastify.post('/:id/advance-round', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/advance-round - Advancing discussion to next round`);

      const DiscussionEngine = require('../core/DiscussionEngine');
      const discussionEngine = new DiscussionEngine();
      const discussion = await discussionEngine.advanceDiscussionRound(id);

      const enriched = await enrichDiscussion(discussion.toJSON());

      return reply.status(200).send({
        success: true,
        discussion: enriched
      });
    } catch (error) {
      log(`Error advancing discussion round: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /discussions/:id/evaluate-checklist - REMOVED (checklist functionality removed)
  /*
  fastify.post('/:id/evaluate-checklist', async (request, reply) => {
    // ... removed ...
  });
  */

  // GET /discussions/:id/state - Get current discussion state
  // Multi-round: Returns current round, checklist, status, and roundHistory
  fastify.get('/:id/state', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`GET /discussions/${id}/state - Fetching current discussion state`);

      const DiscussionEngine = require('../core/DiscussionEngine');
      const discussionEngine = new DiscussionEngine();
      const state = await discussionEngine.getCurrentDiscussionState(id);

      return reply.status(200).send({
        success: true,
        state: state
      });
    } catch (error) {
      log(`Error fetching discussion state: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /discussions/:id/validate-invariants - Validate discussion invariants
  // Returns validation results for all invariant tests
  fastify.get('/:id/validate-invariants', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`GET /discussions/${id}/validate-invariants - Validating discussion invariants`);

      const { runAllInvariantTests } = require('../__tests__/discussionInvariants.test');
      const result = await runAllInvariantTests(id);

      return reply.status(200).send({
        success: true,
        valid: result.valid,
        violations: result.violations,
        testResults: result.testResults
      });
    } catch (error) {
      log(`Error validating discussion invariants: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /discussions/validate-all-invariants - Validate all discussions' invariants
  // Returns validation results for all discussions
  fastify.get('/validate-all-invariants', async (request, reply) => {
    try {
      log(`GET /discussions/validate-all-invariants - Validating all discussion invariants`);

      const { runInvariantTestsOnAllDiscussions } = require('../__tests__/discussionInvariants.test');
      const result = await runInvariantTestsOnAllDiscussions();

      return reply.status(200).send({
        success: true,
        valid: result.valid,
        violations: result.violations,
        discussionResults: result.discussionResults
      });
    } catch (error) {
      log(`Error validating all discussion invariants: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

};
