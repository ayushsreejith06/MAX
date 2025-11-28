const { registry } = require("../utils/contract");

module.exports = function (fastify, opts, done) {
  fastify.post("/register-sector", async (req, reply) => {
    try {
      const { id, name, symbol } = req.body;
      await registry.write.registerSector([id, name, symbol]);
      reply.send({ success: true });
    } catch (error) {
      fastify.log.error(`Error registering sector: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/register-agent", async (req, reply) => {
    try {
      const { id, sectorId, role } = req.body;
      await registry.write.registerAgent([id, sectorId, role]);
      reply.send({ success: true });
    } catch (error) {
      fastify.log.error(`Error registering agent: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/log-trade", async (req, reply) => {
    try {
      const { id, agentId, sectorId, action, amount } = req.body;
      await registry.write.logTrade([id, agentId, sectorId, action, amount]);
      reply.send({ success: true });
    } catch (error) {
      fastify.log.error(`Error logging trade: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/validate", async (req, reply) => {
    try {
      const { agentId, sectorId, action, amount } = req.body;
      const valid = await registry.read.validateAction([agentId, sectorId, action, amount]);
      reply.send({ success: true, valid });
    } catch (error) {
      fastify.log.error(`Error validating action: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  done();
};

