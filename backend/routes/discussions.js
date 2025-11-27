const DiscussionRoom = require('../models/DiscussionRoom');
const { loadDiscussions, saveDiscussions } = require('../utils/discussionStorage');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Manager-only middleware check
function checkManagerAuth(request, reply) {
  if (request.headers['x-manager'] !== 'true') {
    return reply.status(403).send({
      success: false,
      error: 'Manager-only endpoint. x-manager header must be set to true.'
    });
  }
  return null;
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

  // POST /discussions/message - Add a message to a discussion (Manager-only)
  fastify.post('/message', async (request, reply) => {
    try {
      // Check manager auth
      const authError = checkManagerAuth(request, reply);
      if (authError) return authError;

      const { discussionId, agentId, content, role } = request.body;

      if (!discussionId || !agentId || !content || !role) {
        return reply.status(400).send({
          success: false,
          error: 'discussionId, agentId, content, and role are required'
        });
      }

      log(`POST /discussions/message - Adding message to discussion: ${discussionId}`);

      const discussions = await loadDiscussions();
      const discussionIndex = discussions.findIndex(d => d.id === discussionId);

      if (discussionIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionData = discussions[discussionIndex];
      const discussionRoom = DiscussionRoom.fromData(discussionData);

      // Add message
      discussionRoom.addMessage({ agentId, content, role });

      // Set status to "debating" if it was "created"
      if (discussionRoom.status === 'created') {
        discussionRoom.status = 'debating';
      }

      // Update the discussion in the array
      discussions[discussionIndex] = discussionRoom.toJSON();
      await saveDiscussions(discussions);

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

  // POST /discussions/close - Close a discussion (Manager-only)
  fastify.post('/close', async (request, reply) => {
    try {
      // Check manager auth
      const authError = checkManagerAuth(request, reply);
      if (authError) return authError;

      const { discussionId } = request.body;

      if (!discussionId) {
        return reply.status(400).send({
          success: false,
          error: 'discussionId is required'
        });
      }

      log(`POST /discussions/close - Closing discussion: ${discussionId}`);

      const discussions = await loadDiscussions();
      const discussionIndex = discussions.findIndex(d => d.id === discussionId);

      if (discussionIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Discussion not found'
        });
      }

      const discussionData = discussions[discussionIndex];
      const discussionRoom = DiscussionRoom.fromData(discussionData);

      discussionRoom.status = 'closed';
      discussionRoom.updatedAt = new Date().toISOString();

      discussions[discussionIndex] = discussionRoom.toJSON();
      await saveDiscussions(discussions);

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
};
