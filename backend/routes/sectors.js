const { createSector, getSectors, getSectorById } = require('../controllers/sectorsController');
const { registry } = require('../utils/contract');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // GET /sectors - Fetch all sectors
  fastify.get('/', async (request, reply) => {
    try {
      log('GET /sectors - Fetching all sectors');
      const sectors = await getSectors();
      log(`Found ${sectors.length} sectors`);
      return reply.status(200).send({
        success: true,
        data: sectors
      });
    } catch (error) {
      log(`Error fetching sectors: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /sectors/:id - Get sector by ID
  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`GET /sectors/${id} - Fetching sector by ID`);

      const sector = await getSectorById(id);

      if (!sector) {
        log(`Sector with ID ${id} not found`);
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      log(`Found sector - ID: ${sector.id}, Name: ${sector.sectorName}`);
      return reply.status(200).send({
        success: true,
        data: sector
      });
    } catch (error) {
      log(`Error fetching sector: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /sectors - Create new sector
  fastify.post('/', async (request, reply) => {
    try {
      const payload = request.body || {};

      log(`POST /sectors - Creating sector with name: ${payload.sectorName}`);

      const sector = await createSector(payload);

      log(`Sector created successfully - ID: ${sector.id}, Name: ${sector.sectorName || sector.name}`);

      // Auto-sync to chain
      if (process.env.MAX_REGISTRY && registry.write) {
        try {
          const sectorId = parseInt(sector.id) || 0;
          const name = sector.sectorName || sector.name || '';
          const symbol = sector.sectorSymbol || sector.symbol || '';
          
          await registry.write.registerSector([sectorId, name, symbol]);
          log(`Sector ${sectorId} registered on-chain`);
        } catch (chainError) {
          log(`Warning: Failed to register sector on-chain: ${chainError.message}`);
          // Don't fail the request if chain registration fails
        }
      }

      return reply.status(201).send({
        success: true,
        data: sector
      });
    } catch (error) {
      log(`Error creating sector: ${error.message}`);

      return reply.status(400).send({
        success: false,
        error: error.message
      });
    }
  });
};
