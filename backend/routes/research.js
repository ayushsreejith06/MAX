const { runResearchBundle } = require('../agents/research');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // GET /research?sectorId=&topic=
  fastify.get('/', async (request, reply) => {
    try {
      const { sectorId, topic } = request.query;

      if (!sectorId || !topic) {
        return reply.status(400).send({
          success: false,
          error: 'Both sectorId and topic query parameters are required'
        });
      }

      log(`GET /research - Running research bundle for sectorId: ${sectorId}, topic: ${topic}`);

      const results = await runResearchBundle(sectorId, topic);

      log(`Research bundle completed successfully`);

      return reply.status(200).send({
        success: true,
        data: results
      });
    } catch (error) {
      log(`Error running research bundle: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};

