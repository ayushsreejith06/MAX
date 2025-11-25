const DebateRoom = require('../models/DebateRoom');
const { loadDebates, saveDebates } = require('../utils/debateStorage');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // POST /debates/start - Create a new debate room
  fastify.post('/start', async (request, reply) => {
    try {
      const { sectorId, title, agentIds } = request.body;

      if (!sectorId || !title) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId and title are required'
        });
      }

      log(`POST /debates/start - Creating debate with sectorId: ${sectorId}, title: ${title}`);

      const debateRoom = new DebateRoom(sectorId, title, agentIds || []);
      
      // Load existing debates, add new one, and save
      const debates = await loadDebates();
      debates.push(debateRoom.toJSON());
      await saveDebates(debates);

      log(`Debate created successfully - ID: ${debateRoom.id}, Title: ${debateRoom.title}`);

      return reply.status(201).send({
        success: true,
        data: debateRoom.toJSON()
      });
    } catch (error) {
      log(`Error creating debate: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /debates/message - Add a message to a debate
  fastify.post('/message', async (request, reply) => {
    try {
      const { debateId, agentId, content, role } = request.body;

      if (!debateId || !agentId || !content || !role) {
        return reply.status(400).send({
          success: false,
          error: 'debateId, agentId, content, and role are required'
        });
      }

      log(`POST /debates/message - Adding message to debate: ${debateId}`);

      const debates = await loadDebates();
      const debateIndex = debates.findIndex(d => d.id === debateId);

      if (debateIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Debate not found'
        });
      }

      const debateData = debates[debateIndex];
      const debateRoom = DebateRoom.fromData(debateData);

      // Add message
      debateRoom.addMessage({ agentId, content, role });

      // Set status to "debating" if it was "created"
      if (debateRoom.status === 'created') {
        debateRoom.status = 'debating';
      }

      // Update the debate in the array
      debates[debateIndex] = debateRoom.toJSON();
      await saveDebates(debates);

      log(`Message added successfully to debate: ${debateId}`);

      return reply.status(200).send({
        success: true,
        data: debateRoom.toJSON()
      });
    } catch (error) {
      log(`Error adding message: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /debates/close - Close a debate
  fastify.post('/close', async (request, reply) => {
    try {
      const { debateId } = request.body;

      if (!debateId) {
        return reply.status(400).send({
          success: false,
          error: 'debateId is required'
        });
      }

      log(`POST /debates/close - Closing debate: ${debateId}`);

      const debates = await loadDebates();
      const debateIndex = debates.findIndex(d => d.id === debateId);

      if (debateIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Debate not found'
        });
      }

      const debateData = debates[debateIndex];
      const debateRoom = DebateRoom.fromData(debateData);

      debateRoom.status = 'closed';
      debateRoom.updatedAt = new Date().toISOString();

      debates[debateIndex] = debateRoom.toJSON();
      await saveDebates(debates);

      log(`Debate closed successfully: ${debateId}`);

      return reply.status(200).send({
        success: true,
        data: debateRoom.toJSON()
      });
    } catch (error) {
      log(`Error closing debate: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /debates/archive - Archive a debate
  fastify.post('/archive', async (request, reply) => {
    try {
      const { debateId } = request.body;

      if (!debateId) {
        return reply.status(400).send({
          success: false,
          error: 'debateId is required'
        });
      }

      log(`POST /debates/archive - Archiving debate: ${debateId}`);

      const debates = await loadDebates();
      const debateIndex = debates.findIndex(d => d.id === debateId);

      if (debateIndex === -1) {
        return reply.status(404).send({
          success: false,
          error: 'Debate not found'
        });
      }

      const debateData = debates[debateIndex];
      const debateRoom = DebateRoom.fromData(debateData);

      debateRoom.status = 'archived';
      debateRoom.updatedAt = new Date().toISOString();

      debates[debateIndex] = debateRoom.toJSON();
      await saveDebates(debates);

      log(`Debate archived successfully: ${debateId}`);

      return reply.status(200).send({
        success: true,
        data: debateRoom.toJSON()
      });
    } catch (error) {
      log(`Error archiving debate: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /debates - Get all debates, optionally filtered by sectorId
  fastify.get('/', async (request, reply) => {
    try {
      const { sectorId } = request.query;

      if (sectorId) {
        log(`GET /debates - Fetching debates for sectorId: ${sectorId}`);
      } else {
        log(`GET /debates - Fetching all debates`);
      }

      let debates = await loadDebates();

      // Filter by sectorId if provided
      if (sectorId) {
        debates = debates.filter(debate => debate.sectorId === sectorId);
        log(`Found ${debates.length} debates for sectorId: ${sectorId}`);
      } else {
        log(`Found ${debates.length} debates`);
      }

      // Sort by newest first (by createdAt, then updatedAt)
      debates.sort((a, b) => {
        const dateA = new Date(b.updatedAt || b.createdAt);
        const dateB = new Date(a.updatedAt || a.createdAt);
        return dateA - dateB;
      });

      return reply.status(200).send({
        success: true,
        data: debates
      });
    } catch (error) {
      log(`Error fetching debates: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /debates/:id - Get a single debate by id
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /debates/${id} - Fetching debate by ID`);

      const debates = await loadDebates();
      const debate = debates.find(d => d.id === id);

      if (!debate) {
        log(`Debate with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Debate not found'
        });
      }

      log(`Found debate - ID: ${debate.id}, Title: ${debate.title}`);
      return reply.status(200).send({
        success: true,
        data: debate
      });
    } catch (error) {
      log(`Error fetching debate: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};
