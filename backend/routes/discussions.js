const DiscussionRoom = require('../models/DiscussionRoom');
const { loadDiscussions, saveDiscussions, saveDiscussion, findDiscussionById } = require('../utils/discussionStorage');
const {
  startDiscussion,
  collectArguments,
  aggregateVotes,
  produceDecision,
  closeDiscussion,
  archiveDiscussion
} = require('../agents/discussion/discussionLifecycle');
const { loadAgents } = require('../utils/agentStorage');

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
    const enrichedMessages = discussion.messages.map(msg => {
      const agent = agentMap.get(msg.agentId);
      return {
        ...msg,
        agentName: agent?.name || msg.agentName || 'Unknown Agent',
        timestamp: msg.timestamp || msg.createdAt
      };
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
  // GET /discussions - Get all discussions, optionally filtered by sectorId
  fastify.get('/', async (request, reply) => {
    try {
      const { sectorId } = request.query;

      if (sectorId) {
        log(`GET /discussions - Fetching discussions for sectorId: ${sectorId}`);
      } else {
        log(`GET /discussions - Fetching all discussions`);
      }

      let discussions = await loadDiscussions();

      // Filter by sectorId if provided
      if (sectorId) {
        discussions = discussions.filter(discussion => discussion.sectorId === sectorId);
        log(`Found ${discussions.length} discussions for sectorId: ${sectorId}`);
      } else {
        log(`Found ${discussions.length} discussions`);
      }

      // Enrich all discussions with agent names
      const enrichedDiscussions = await Promise.all(
        discussions.map(discussion => enrichDiscussion(discussion))
      );

      // Sort by newest first (by updatedAt, then createdAt)
      enrichedDiscussions.sort((a, b) => {
        const dateA = new Date(b.updatedAt || b.createdAt);
        const dateB = new Date(a.updatedAt || a.createdAt);
        return dateA - dateB;
      });

      return reply.status(200).send(enrichedDiscussions);
    } catch (error) {
      log(`Error fetching discussions: ${error.message}`);
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
      log(`Error closing discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
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
      log(`Error archiving discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /discussions/:id/accept - Accept a discussion (set status to accepted)
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
      discussionRoom.status = 'accepted';
      discussionRoom.updatedAt = new Date().toISOString();
      await saveDiscussion(discussionRoom);

      const enriched = await enrichDiscussion(discussionRoom.toJSON());

      log(`Discussion accepted successfully: ${id}`);

      return reply.status(200).send(enriched);
    } catch (error) {
      log(`Error accepting discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
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
      log(`Error rejecting discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
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
