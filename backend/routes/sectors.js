const { createSector, getSectors, getSectorById, updateSectorPerformance } = require('../controllers/sectorsController');
const { registry } = require('../utils/contract');
const { getSimulationEngine } = require('../simulation/SimulationEngine');

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
      if (!process.env.MAX_REGISTRY) {
        console.warn("MAX_REGISTRY undefined — skipping chain sync");
      } else {
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

  // POST /sectors/:id/simulate-tick - Run a simulation tick for a sector
  fastify.post('/:id/simulate-tick', async (request, reply) => {
    try {
      const { id } = request.params;
      const { decisions = [] } = request.body || {};

      log(`POST /sectors/${id}/simulate-tick - Running simulation tick`);

      // Get sector to ensure it exists
      const sector = await getSectorById(id);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Get simulation engine
      const simulationEngine = getSimulationEngine();

      // Initialize sector if not already initialized
      const sectorState = simulationEngine.getSectorState(id);
      if (!sectorState) {
        await simulationEngine.initializeSector(
          id,
          sector.currentPrice || 100,
          0.02 // Default volatility
        );
      }

      // Run simulation tick
      const tickResult = await simulationEngine.simulateTick(id, decisions);

      log(`Simulation tick completed for sector ${id}: ${tickResult.executedTrades.length} trades executed`);

      return reply.status(200).send({
        success: true,
        data: tickResult
      });
    } catch (error) {
      log(`Error running simulation tick: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /sectors/:id/update-performance - Update sector performance metrics
  fastify.post('/:id/update-performance', async (request, reply) => {
    try {
      const { id } = request.params;
      log(`POST /sectors/${id}/update-performance - Updating sector performance`);

      const updatedSector = await updateSectorPerformance(id);

      log(`Sector performance updated - ID: ${updatedSector.id}, New Price: ${updatedSector.currentPrice}, Volatility: ${updatedSector.volatility}, Risk Score: ${updatedSector.riskScore}`);

      return reply.status(200).send({
        success: true,
        data: updatedSector
      });
    } catch (error) {
      log(`Error updating sector performance: ${error.message}`);
      
      if (error.message === 'Sector not found') {
        return reply.status(404).send({
          success: false,
          error: error.message
        });
      }

      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};
