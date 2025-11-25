const { createSector, getSectors, getSectorById } = require('../controllers/sectorsController');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    try {
      log(`GET /sectors - Fetching all sectors`);
      const sectors = await getSectors();
      log(`Found ${sectors.length} sectors`);
      return {
        success: true,
        data: sectors
      };
    } catch (error) {
      log(`Error fetching sectors: ${error.message}`);
      reply.code(500);
      return {
        success: false,
        error: error.message
      };
    }
  });

  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /sectors/${id} - Fetching sector by ID`);
      
      const sector = await getSectorById(id);
      
      if (!sector) {
        log(`Sector with ID ${id} not found`);
        reply.code(404);
        return {
          success: false,
          error: 'Sector not found'
        };
      }
      
      log(`Found sector - ID: ${sector.id}, Name: ${sector.name}`);
      return {
        success: true,
        data: sector
      };
    } catch (error) {
      log(`Error fetching sector: ${error.message}`);
      reply.code(500);
      return {
        success: false,
        error: error.message
      };
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      const { name } = request.body;

      log(`POST /sectors - Creating sector with name: ${name}`);

      const sector = await createSector(name);

      log(`Sector created successfully - ID: ${sector.id}, Name: ${sector.name}`);

      reply.code(201);
      return {
        success: true,
        data: sector.toJSON()
      };
    } catch (error) {
      log(`Error creating sector: ${error.message}`);

      reply.code(400);
      return {
        success: false,
        error: error.message
      };
    }
  });
};
