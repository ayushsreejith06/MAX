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

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Helper to enrich discussion with agent names
async function enrichDiscussion(discussion) {
  try {
    const agents = await loadAgents();
    const agentMap = new Map(agents.map(agent => [agent.id, agent]));

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
      messages: enrichedMessages
    };
  } catch (error) {
    log(`Error enriching discussion: ${error.message}`);
    return discussion;
  }
}

module.exports = async (fastify) => {
  // GET /discussions/rejected-items - Get all rejected checklist items from all discussions
  fastify.get('/rejected-items', async (request, reply) => {
    try {
      log('GET /discussions/rejected-items - Fetching all rejected items');
      
      const rejectedItems = await loadRejectedItems();
      
      log(`Found ${rejectedItems.length} rejected items`);
      
      return reply.status(200).send({
        rejected: rejectedItems
      });
    } catch (error) {
      log(`Error fetching rejected items: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /discussions - Get all discussions with pagination, optionally filtered by sectorId or status
  // Returns only summary fields (no messages or full participant data)
  fastify.get('/', async (request, reply) => {
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
      const statusCounts = {
        all: allDiscussions.length,
        in_progress: allDiscussions.filter(d => d.status === 'in_progress').length,
        decided: allDiscussions.filter(d => d.status === 'decided').length,
        rejected: allDiscussions.filter(d => d.status === 'rejected').length,
      };

      let discussions = allDiscussions;

      // Filter by sectorId if provided
      if (sectorId) {
        discussions = discussions.filter(discussion => discussion.sectorId === sectorId);
        log(`Found ${discussions.length} discussions for sectorId: ${sectorId}`);
      }

      // Filter by status if provided (and not 'all')
      if (status && status !== 'all') {
        discussions = discussions.filter(discussion => discussion.status === status);
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
        
        return {
          id: discussion.id,
          title: discussion.title || 'Untitled Discussion',
          sector: sectorInfo?.symbol || 'N/A', // Sector symbol as requested
          sectorId: discussion.sectorId, // Keep for backward compatibility
          status: discussion.status || 'in_progress',
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

  // GET /discussions/:id/checklist - Get checklist for a discussion
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

      // Get proposed checklist items (from discussion.checklist)
      const checklistItems = Array.isArray(discussion.checklist) ? discussion.checklist : [];
      
      // Get finalized checklist items (from discussion.finalizedChecklist)
      const finalizedChecklistItems = Array.isArray(discussion.finalizedChecklist) ? discussion.finalizedChecklist : [];
      
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

      // Format proposed checklist items with approval status
      const checklist = checklistItems.map(item => {
        const decision = decisionMap.get(item.id);
        return {
          id: item.id,
          description: item.reason || item.reasoning || item.text || '',
          action: item.action,
          amount: item.amount,
          confidence: item.confidence,
          round: item.round,
          agentId: item.agentId,
          agentName: item.agentName,
          approvalStatus: decision ? (decision.approved ? 'accepted' : 'rejected') : 'pending',
          approvalReason: decision ? decision.reason : null
        };
      });

      // Format finalized checklist items
      const finalizedChecklist = finalizedChecklistItems.map(item => ({
        id: item.id,
        description: item.reason || item.reasoning || '',
        action: item.action,
        amount: item.amount,
        confidence: item.confidence,
        round: item.round,
        agentId: item.agentId,
        agentName: item.agentName,
        approvalStatus: 'accepted',
        approvedAt: item.approvedAt
      }));

      // Find finalizedAt timestamp (use updatedAt when status changed to finalized)
      const finalizedAt = discussion.status === 'finalized' 
        ? (discussion.updatedAt || discussion.createdAt)
        : null;

      const response = {
        discussionId: id,
        status: discussion.status,
        checklist: checklist,
        finalizedChecklist: finalizedChecklist
      };

      log(`Found checklist for discussion ${id}: ${checklist.length} proposed items, ${finalizedChecklist.length} finalized items`);
      return reply.status(200).send(response);
    } catch (error) {
      log(`Error fetching checklist: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

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

      const enriched = await enrichDiscussion(discussion);
      log(`Found discussion - ID: ${enriched.id}, Title: ${enriched.title}`);
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
      const { sectorId, title, agentIds } = request.body;

      if (!sectorId || !title) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId and title are required'
        });
      }

      log(`POST /discussions - Creating discussion with sectorId: ${sectorId}, title: ${title}`);

      const discussionRoom = await startDiscussion(sectorId, title, agentIds);

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

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

      // Add message
      discussionRoom.addMessage({ 
        agentId, 
        content, 
        role: role || 'agent',
        agentName: agentName || undefined
      });

      // Ensure status is in_progress if it was created
      if (discussionRoom.status === 'created') {
        discussionRoom.status = 'in_progress';
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

  // POST /discussions/:id/close - Close a discussion
  fastify.post('/:id/close', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/close - Closing discussion: ${id}`);

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

  // POST /discussions/:id/archive - Archive a discussion
  fastify.post('/:id/archive', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/archive - Archiving discussion: ${id}`);

      const discussionRoom = await archiveDiscussion(id);

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Discussion archived successfully: ${id}`);

      return reply.status(200).send(enriched);
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      log(`Error archiving discussion: ${errorMessage}`);
      return reply.status(500).send({
        success: false,
        error: errorMessage
      });
    }
  });

  // POST /discussions/:id/accept - Accept a discussion (set status to accepted)
  // Only accepts if discussion has approved checklist items (finalizedChecklist)
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
      discussionRoom.status = 'decided';
      discussionRoom.updatedAt = new Date().toISOString();
      await saveDiscussion(discussionRoom);

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Discussion accepted successfully: ${id} with ${finalizedChecklist.length} approved checklist items`);

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

  // POST /discussions/:id/reject - Reject a discussion (set status to rejected)
  fastify.post('/:id/reject', async (request, reply) => {
    try {
      const { id } = request.params;

      log(`POST /discussions/${id}/reject - Rejecting discussion: ${id}`);

      const discussionData = await findDiscussionById(id);
      if (!discussionData) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);
      discussionRoom.status = 'rejected';
      discussionRoom.updatedAt = new Date().toISOString();
      await saveDiscussion(discussionRoom);

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Discussion rejected successfully: ${id}`);

      return reply.status(200).send(enriched);
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error occurred';
      log(`Error rejecting discussion: ${errorMessage}`);
      return reply.status(500).send({
        success: false,
        error: errorMessage
      });
    }
  });

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

};
