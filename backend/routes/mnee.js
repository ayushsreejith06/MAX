const { registry, publicClient } = require("../utils/contract");
const { parseAbi } = require("viem");

module.exports = function (fastify, opts, done) {
  fastify.post("/register-sector", async (req, reply) => {
    try {
      if (!registry) {
        return reply.status(503).send({ success: false, error: "Contract not initialized. Check MAX_REGISTRY environment variable." });
      }
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
      if (!registry) {
        return reply.status(503).send({ success: false, error: "Contract not initialized. Check MAX_REGISTRY environment variable." });
      }
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
      if (!registry) {
        return reply.status(503).send({ success: false, error: "Contract not initialized. Check MAX_REGISTRY environment variable." });
      }
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
      if (!registry) {
        return reply.status(503).send({ success: false, error: "Contract not initialized. Check MAX_REGISTRY environment variable." });
      }
      const { agentId, sectorId, action, amount } = req.body;
      const valid = await registry.read.validateAction([agentId, sectorId, action, amount]);
      reply.send({ success: true, valid });
    } catch (error) {
      fastify.log.error(`Error validating action: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/mnee/events
   * 
   * Reads all on-chain events (sectors, agents, trades) from the contract.
   * Returns parsed objects with event type, actor (creator), timestamp, and data.
   * 
   * Response format:
   * {
   *   events: [
   *     {
   *       type: "sector" | "agent" | "trade",
   *       actor: "0x...", // creator address
   *       timestamp: 1234567890, // Unix timestamp
   *       data: { ... } // event-specific data
   *     }
   *   ],
   *   counts: {
   *     sectors: 0,
   *     agents: 0,
   *     trades: 0
   *   }
   * }
   */
  fastify.get("/events", async (req, reply) => {
    try {
      if (!registry || !publicClient) {
        return reply.status(503).send({ 
          success: false, 
          error: "Contract not initialized. Check MAX_REGISTRY environment variable." 
        });
      }

      const CONTRACT_ADDRESS = process.env.MAX_REGISTRY;
      if (!CONTRACT_ADDRESS) {
        return reply.status(503).send({ 
          success: false, 
          error: "Contract address not configured." 
        });
      }

      const events = [];
      const counts = { sectors: 0, agents: 0, trades: 0 };

      // Read sectors by querying IDs starting from 1 until we get an empty result
      // An empty sector has id == 0
      let sectorId = 1;
      const maxIterations = 1000; // Safety limit
      let iterations = 0;

      while (iterations < maxIterations) {
        try {
          const sector = await registry.read.sectors([sectorId]);
          // Check if sector exists (id != 0)
          if (sector && sector.id && BigInt(sector.id) !== 0n) {
            events.push({
              type: "sector",
              actor: sector.creator,
              timestamp: null, // Sectors don't have timestamps in the struct
              data: {
                id: String(sector.id),
                name: sector.name,
                symbol: sector.symbol,
                creator: sector.creator
              }
            });
            counts.sectors++;
            sectorId++;
            iterations++;
          } else {
            break; // No more sectors
          }
        } catch (error) {
          // If reading fails, assume no more sectors
          break;
        }
      }

      // Read agents
      let agentId = 1;
      iterations = 0;
      while (iterations < maxIterations) {
        try {
          const agent = await registry.read.agents([agentId]);
          if (agent && agent.id && BigInt(agent.id) !== 0n) {
            events.push({
              type: "agent",
              actor: agent.creator,
              timestamp: null, // Agents don't have timestamps in the struct
              data: {
                id: String(agent.id),
                sectorId: String(agent.sectorId),
                role: agent.role,
                creator: agent.creator
              }
            });
            counts.agents++;
            agentId++;
            iterations++;
          } else {
            break;
          }
        } catch (error) {
          break;
        }
      }

      // Read trades (these have timestamps)
      let tradeId = 1;
      iterations = 0;
      while (iterations < maxIterations) {
        try {
          const trade = await registry.read.trades([tradeId]);
          if (trade && trade.id && BigInt(trade.id) !== 0n) {
            events.push({
              type: "trade",
              actor: null, // Trades don't have creator in the struct
              timestamp: Number(trade.timestamp),
              data: {
                id: String(trade.id),
                agentId: String(trade.agentId),
                sectorId: String(trade.sectorId),
                action: trade.action,
                amount: String(trade.amount),
                timestamp: Number(trade.timestamp)
              }
            });
            counts.trades++;
            tradeId++;
            iterations++;
          } else {
            break;
          }
        } catch (error) {
          break;
        }
      }

      // Sort events by timestamp (trades first, then others)
      // For events without timestamps, put them at the end
      events.sort((a, b) => {
        if (a.timestamp === null && b.timestamp === null) return 0;
        if (a.timestamp === null) return 1;
        if (b.timestamp === null) return -1;
        return b.timestamp - a.timestamp; // Most recent first
      });

      reply.send({ 
        success: true, 
        events,
        counts
      });
    } catch (error) {
      fastify.log.error(`Error fetching contract events: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  done();
};

