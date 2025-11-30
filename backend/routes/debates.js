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

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // POST /debates/start - Create a new discussion room (legacy endpoint)
  fastify.post('/start', async (request, reply) => {
    try {
      const { sectorId, title, agentIds } = request.body;

      if (!sectorId || !title) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId and title are required'
        });
      }

      log(`POST /debates/start - Creating discussion with sectorId: ${sectorId}, title: ${title}`);

      const discussionRoom = await startDiscussion(sectorId, title, agentIds);

      log(`Discussion created successfully - ID: ${discussionRoom.id}, Title: ${discussionRoom.title}`);

      return reply.status(201).send({
        success: true,
        data: discussionRoom.toJSON()
      });
    } catch (error) {
      log(`Error creating discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /debates/message - Add a message to a discussion (legacy endpoint)
  fastify.post('/message', async (request, reply) => {
    try {
      const { debateId, agentId, content, role } = request.body;
      const discussionId = debateId; // Map legacy parameter name

      if (!discussionId || !agentId || !content || !role) {
        return reply.status(400).send({
          success: false,
          error: 'debateId (discussionId), agentId, content, and role are required'
        });
      }

      log(`POST /debates/message - Adding message to discussion: ${discussionId}`);

      const discussionData = await findDiscussionById(discussionId);
      if (!discussionData) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionRoom = DiscussionRoom.fromData(discussionData);

      // Add message
      discussionRoom.addMessage({ agentId, content, role });

      // Ensure status is in_progress if it was created
      if (discussionRoom.status === 'created') {
        discussionRoom.status = 'in_progress';
      }

      await saveDiscussion(discussionRoom);

      log(`Message added successfully to discussion: ${discussionId}`);

      return reply.status(200).send({
        success: true,
        data: discussionRoom.toJSON()
      });
    } catch (error) {
      log(`Error adding message: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /debates/close - Close a discussion (legacy endpoint)
  fastify.post('/close', async (request, reply) => {
    try {
      const { debateId } = request.body;
      const discussionId = debateId; // Map legacy parameter name

      if (!discussionId) {
        return reply.status(400).send({
          success: false,
          error: 'debateId (discussionId) is required'
        });
      }

      log(`POST /debates/close - Closing discussion: ${discussionId}`);

      const discussionRoom = await closeDiscussion(discussionId);

      log(`Discussion closed successfully: ${discussionId}`);

      return reply.status(200).send({
        success: true,
        data: discussionRoom.toJSON()
      });
    } catch (error) {
      log(`Error closing discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /debates/archive - Archive a discussion (legacy endpoint)
  fastify.post('/archive', async (request, reply) => {
    try {
      const { debateId } = request.body;
      const discussionId = debateId; // Map legacy parameter name

      if (!discussionId) {
        return reply.status(400).send({
          success: false,
          error: 'debateId (discussionId) is required'
        });
      }

      log(`POST /debates/archive - Archiving discussion: ${discussionId}`);

      const discussionRoom = await archiveDiscussion(discussionId);

      log(`Discussion archived successfully: ${discussionId}`);

      return reply.status(200).send({
        success: true,
        data: discussionRoom.toJSON()
      });
    } catch (error) {
      log(`Error archiving discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /debates - Get all discussions, optionally filtered by sectorId (legacy endpoint)
  fastify.get('/', async (request, reply) => {
    try {
      const { sectorId } = request.query;

      if (sectorId) {
        log(`GET /debates - Fetching discussions for sectorId: ${sectorId}`);
      } else {
        log(`GET /debates - Fetching all discussions`);
      }

      let discussions = await loadDiscussions();

      // Filter by sectorId if provided
      if (sectorId) {
        discussions = discussions.filter(discussion => discussion.sectorId === sectorId);
        log(`Found ${discussions.length} discussions for sectorId: ${sectorId}`);
      } else {
        log(`Found ${discussions.length} discussions`);
      }

      // Sort by newest first (by createdAt, then updatedAt)
      discussions.sort((a, b) => {
        const dateA = new Date(b.updatedAt || b.createdAt);
        const dateB = new Date(a.updatedAt || a.createdAt);
        return dateA - dateB;
      });

      return reply.status(200).send({
        success: true,
        data: discussions
      });
    } catch (error) {
      log(`Error fetching discussions: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /debates/:id - Get a single discussion by id (legacy endpoint)
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /debates/${id} - Fetching discussion by ID`);

      const discussions = await loadDiscussions();
      const discussion = discussions.find(d => d.id === id);

      if (!discussion) {
        log(`Discussion with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      log(`Found discussion - ID: ${discussion.id}, Title: ${discussion.title}`);
      return reply.status(200).send({
        success: true,
        data: discussion
      });
    } catch (error) {
      log(`Error fetching discussion: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};
