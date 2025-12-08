const { getSectorById } = require('../controllers/sectorsController');
const { getSimulationEngine } = require('../simulation/SimulationEngine');
const { executeSimulationTick } = require('../controllers/simulationController');
const ManagerAgent = require('../agents/manager/ManagerAgent');
const ExecutionAgent = require('../agents/ExecutionAgent');
const { loadAgents } = require('../utils/agentStorage');
const { getAgentRuntime } = require('../agents/runtime/agentRuntime');
const { registry, publicClient } = require('../utils/contract');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // POST /simulation/tick - Execute a simulation tick for a sector
  fastify.post('/tick', async (request, reply) => {
    try {
      const { sectorId } = request.body;
      
      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required in request body'
        });
      }

      log(`POST /simulation/tick - Executing tick for sector ${sectorId}`);

      const result = await executeSimulationTick(sectorId);
      const { sector, agents } = result;

      // Transform response to match frontend SimulateTickResult interface
      const simulationResult = {
        sectorId: sector.id || sectorId,
        timestamp: Date.now(),
        newPrice: sector.currentPrice || sector.lastSimulatedPrice || 100,
        riskScore: sector.riskScore || 0,
        executedTrades: sector.performance?.recentTrades || [],
        rejectedTrades: [],
        orderbook: null,
        lastTrade: sector.performance?.recentTrades?.[sector.performance.recentTrades.length - 1] || null,
        priceChange: sector.change || 0,
        priceChangePercent: sector.changePercent || 0
      };

      // Try to get orderbook from simulation engine if available
      try {
        const simulationEngine = getSimulationEngine();
        const sectorState = simulationEngine.getSectorState(sectorId);
        if (sectorState && sectorState.orderbook) {
          simulationResult.orderbook = sectorState.orderbook.getSummary();
          const recentTrades = sectorState.orderbook.getTradeHistory(10) || [];
          if (recentTrades.length > 0) {
            simulationResult.executedTrades = recentTrades;
            simulationResult.lastTrade = recentTrades[recentTrades.length - 1];
          }
        }
      } catch (error) {
        log(`Could not get orderbook from simulation engine: ${error.message}`);
      }

      return reply.status(200).send({
        success: true,
        data: simulationResult
      });
    } catch (error) {
      log(`Error executing simulation tick: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /simulation/performance - Get simulation performance for a sector
  fastify.get('/performance', async (request, reply) => {
    try {
      const { sectorId } = request.query;
      
      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId query parameter is required'
        });
      }

      log(`GET /simulation/performance - Fetching performance for sector ${sectorId}`);

      // Get sector to check if it exists
      const sector = await getSectorById(sectorId);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Get simulation engine
      const simulationEngine = getSimulationEngine();
      const sectorState = simulationEngine.getSectorState(sectorId);

      // If simulation not initialized, return default values
      if (!sectorState) {
        return reply.status(200).send({
          startingCapital: sector.balance || 0,
          currentCapital: sector.balance || 0,
          pnl: 0,
          recentTrades: []
        });
      }

      // Get orderbook to access trade history
      const { orderbook } = sectorState;
      const recentTrades = orderbook.getTradeHistory(5);

      // Calculate performance metrics
      // Starting capital: sector balance (frozen at simulation start)
      // For now, we'll use the current balance as starting capital
      // In a more sophisticated system, we'd track the initial balance separately
      const startingCapital = sector.balance || 0;
      
      // Current capital: starting capital + realized P/L from trades
      // For simplicity, we'll calculate P/L based on trade history
      // In a real system, we'd track positions and calculate unrealized P/L
      let realizedPL = 0;
      
      // Calculate realized P/L from trades
      // This is a simplified calculation - in reality, we'd need to track positions
      // For now, we'll use a simple approach: sum of (sell price - buy price) * quantity
      // This is not accurate but gives a basic metric
      const allTrades = orderbook.getTradeHistory(1000);
      for (const trade of allTrades) {
        // Simplified: assume trades are profitable if price increased
        // In reality, we'd need to track buy/sell positions
        const order = orderbook.getOrder(trade.buyOrderId);
        if (order && order.side === 'buy') {
          // This is a simplified calculation
          // Real P/L would require tracking positions
        }
      }

      // Get current price from price simulator
      const currentPrice = sectorState.priceSimulator?.getPrice() || sectorState.priceSimulator?.currentPrice || sector.currentPrice || 100;
      
      // Use sector balance as starting capital
      // In a more sophisticated system, we'd track the initial balance when simulation starts
      
      // Calculate P/L based on price change
      // This is a simplified calculation - in production, you'd track actual positions
      // For now, we'll calculate based on the assumption that we're tracking price performance
      const startingPrice = sector.currentPrice || 100;
      const priceChange = currentPrice - startingPrice;
      const priceChangePercent = startingPrice > 0 ? (priceChange / startingPrice) * 100 : 0;
      
      // Simplified P/L: if we had invested the balance, what would the return be?
      // This assumes we're tracking the performance of capital deployed
      const estimatedPL = startingCapital > 0 
        ? (startingCapital * priceChangePercent) / 100 
        : 0;
      
      const currentCapital = startingCapital + estimatedPL;
      const pnl = currentCapital - startingCapital;

      return reply.status(200).send({
        startingCapital,
        currentCapital,
        pnl,
        recentTrades: recentTrades.map(trade => ({
          id: trade.id,
          price: trade.price,
          quantity: trade.quantity,
          timestamp: trade.timestamp
        }))
      });
    } catch (error) {
      log(`Error fetching simulation performance: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /simulation/:sectorId/performance - Update sector performance metrics
  fastify.post('/:sectorId/performance', async (request, reply) => {
    try {
      const { sectorId } = request.params;

      log(`POST /simulation/${sectorId}/performance - Updating performance for sector ${sectorId}`);

      // Get updated sector data
      const sector = await getSectorById(sectorId);
      if (!sector) {
        return reply.status(404).send({
          success: false,
          error: 'Sector not found'
        });
      }

      // Return updated sector in format expected by frontend
      return reply.status(200).send({
        success: true,
        data: sector
      });
    } catch (error) {
      log(`Error updating performance for sector ${request.params.sectorId}: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to update sector performance'
      });
    }
  });

  // POST /simulation/decide - Manager decision-making
  fastify.post('/decide', async (request, reply) => {
    try {
      const { sectorId, signals, conflictThreshold, autoExecute, executionOptions = {} } = request.body;

      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required'
        });
      }

      log(`POST /simulation/decide - Processing decision for sector ${sectorId}`);

      // Try to get existing manager from runtime, or create a temporary one
      let manager;
      try {
        const agentRuntime = getAgentRuntime();
        manager = agentRuntime.getManagerBySector(sectorId);
        
        // If no manager found, create a temporary one for this request
        if (!manager) {
          // Try to find a manager agent in storage
          const agents = await loadAgents();
          const managerAgent = agents.find(a => 
            (a.role === 'manager' || a.role?.toLowerCase().includes('manager')) && 
            a.sectorId === sectorId
          );
          
          if (managerAgent) {
            manager = new ManagerAgent({
              id: managerAgent.id,
              sectorId: managerAgent.sectorId,
              name: managerAgent.name,
              personality: managerAgent.personality || {},
              performance: managerAgent.performance || {},
              memory: managerAgent.memory || [],
              runtimeConfig: { conflictThreshold: conflictThreshold || 0.5 }
            });
          } else {
            // Create a temporary manager instance for this request
            const tempId = `temp-manager-${sectorId}-${Date.now()}`;
            manager = new ManagerAgent({
              id: tempId,
              sectorId: sectorId,
              name: `Temporary Manager for ${sectorId}`,
              personality: {},
              performance: {},
              memory: [],
              runtimeConfig: { conflictThreshold: conflictThreshold || 0.5 }
            });
          }
        } else {
          // Set conflict threshold if provided
          if (typeof conflictThreshold === 'number') {
            manager.conflictThreshold = conflictThreshold;
            manager.runtimeConfig.conflictThreshold = conflictThreshold;
          }
        }
      } catch (error) {
        log(`Error getting manager from runtime, using fallback: ${error.message}`);
        // Create a temporary manager instance as fallback
        const tempId = `temp-manager-${sectorId}-${Date.now()}`;
        manager = new ManagerAgent({
          id: tempId,
          sectorId: sectorId,
          name: `Temporary Manager for ${sectorId}`,
          personality: {},
          performance: {},
          memory: [],
          runtimeConfig: { conflictThreshold: conflictThreshold || 0.5 }
        });
      }

      // If signals are provided, use them directly
      let agentSignals = signals;

      // If signals are not provided, generate mock signals from sector agents
      if (!agentSignals || !Array.isArray(agentSignals) || agentSignals.length === 0) {
        log(`No signals provided, generating mock signals from sector agents`);
        
        try {
          const agents = await loadAgents();
          const sectorAgents = agents.filter(agent => agent.sectorId === sectorId);

          if (sectorAgents.length === 0) {
            return reply.status(404).send({
              success: false,
              error: `No agents found for sector ${sectorId}`
            });
          }

          // Generate mock signals for testing
          const actions = ['BUY', 'SELL', 'HOLD'];
          agentSignals = sectorAgents.map(agent => {
            const randomAction = actions[Math.floor(Math.random() * actions.length)];
            const randomConfidence = Math.random(); // 0-1
            
            return {
              action: randomAction,
              confidence: randomConfidence,
              agentId: agent.id,
              winRate: agent.performance?.winRate || 0
            };
          });

          log(`Generated ${agentSignals.length} mock signals for ${sectorAgents.length} agents`);
        } catch (error) {
          log(`Error generating mock signals: ${error.message}`);
          return reply.status(500).send({
            success: false,
            error: `Failed to generate signals: ${error.message}`
          });
        }
      }

      // Validate signals format
      if (!Array.isArray(agentSignals) || agentSignals.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No valid signals provided'
        });
      }

      // Make decision
      const decision = await manager.decide(agentSignals, { conflictThreshold });

      log(`Decision made: ${decision.action} (confidence: ${decision.confidence.toFixed(2)})`);

      // If autoExecute is enabled, execute the decision
      let executionResult = null;

      if (autoExecute && decision.action !== 'HOLD' && decision.action !== 'NEEDS_REVIEW') {
        try {
          log(`Auto-executing decision for sector ${sectorId}`);
          const executionAgent = new ExecutionAgent(sectorId);
          executionResult = await executionAgent.execute(decision, executionOptions);
          log(`Execution result: ${executionResult.status}`);
        } catch (error) {
          log(`Error auto-executing decision: ${error.message}`);
          executionResult = {
            success: false,
            status: 'ERROR',
            reason: error.message
          };
        }
      }

      return reply.status(200).send({
        success: true,
        data: decision,
        execution: executionResult
      });
    } catch (error) {
      log(`Error in /simulation/decide: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /simulation/status - Manager status
  fastify.get('/status', async (request, reply) => {
    try {
      const agentRuntime = getAgentRuntime();
      const status = agentRuntime.getStatus();
      
      return reply.status(200).send({
        success: true,
        data: status
      });
    } catch (error) {
      log(`Error in /simulation/status: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /simulation/decisions/:sectorId - Get decisions for a sector
  fastify.get('/decisions/:sectorId', async (request, reply) => {
    try {
      const { sectorId } = request.params;
      const agentRuntime = getAgentRuntime();
      const decisions = agentRuntime.getDecisionsForSector(sectorId);
      
      return reply.status(200).send({
        success: true,
        data: decisions
      });
    } catch (error) {
      log(`Error in /simulation/decisions/:sectorId: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // POST /simulation/execute - Execute a decision
  fastify.post('/execute', async (request, reply) => {
    try {
      const { sectorId, decision, options = {} } = request.body;

      // Validate input
      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required'
        });
      }

      if (!decision || typeof decision !== 'object') {
        return reply.status(400).send({
          success: false,
          error: 'decision is required and must be an object'
        });
      }

      if (!decision.action) {
        return reply.status(400).send({
          success: false,
          error: 'decision.action is required'
        });
      }

      log(`Executing decision for sector ${sectorId}: ${decision.action} (confidence: ${decision.confidence || 'N/A'})`);

      // Create execution agent and execute
      const executionAgent = new ExecutionAgent(sectorId);
      const result = await executionAgent.execute(decision, options);

      log(`Execution result: ${result.status} (${result.success ? 'success' : 'failed'})`);

      if (result.success) {
        return reply.status(200).send({
          success: true,
          ...result
        });
      } else {
        return reply.status(200).send({
          success: false,
          ...result
        });
      }
    } catch (error) {
      log(`Error executing trade: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // GET /simulation/logs/:sectorId - Get execution logs for a sector
  fastify.get('/logs/:sectorId', async (request, reply) => {
    try {
      const { sectorId } = request.params;
      const limit = Math.min(parseInt(request.query.limit) || 100, 1000);

      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required'
        });
      }

      const executionAgent = new ExecutionAgent(sectorId);
      const logs = await executionAgent.getExecutionLogs(limit);

      return reply.status(200).send({
        success: true,
        logs
      });
    } catch (error) {
      log(`Error fetching execution logs: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // Contract/Blockchain endpoints (formerly /api/mnee)
  // POST /simulation/contract/register-sector
  fastify.post('/contract/register-sector', async (request, reply) => {
    try {
      if (!registry) {
        return reply.status(503).send({ success: false, error: "Contract not initialized. Check MAX_REGISTRY environment variable." });
      }
      const { id, name, symbol } = request.body;
      await registry.write.registerSector([id, name, symbol]);
      reply.send({ success: true });
    } catch (error) {
      log(`Error registering sector: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST /simulation/contract/register-agent
  fastify.post('/contract/register-agent', async (request, reply) => {
    try {
      if (!registry) {
        return reply.status(503).send({ success: false, error: "Contract not initialized. Check MAX_REGISTRY environment variable." });
      }
      const { id, sectorId, role } = request.body;
      await registry.write.registerAgent([id, sectorId, role]);
      reply.send({ success: true });
    } catch (error) {
      log(`Error registering agent: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST /simulation/contract/log-trade
  fastify.post('/contract/log-trade', async (request, reply) => {
    try {
      if (!registry) {
        return reply.status(503).send({ success: false, error: "Contract not initialized. Check MAX_REGISTRY environment variable." });
      }
      const { id, agentId, sectorId, action, amount } = request.body;
      await registry.write.logTrade([id, agentId, sectorId, action, amount]);
      reply.send({ success: true });
    } catch (error) {
      log(`Error logging trade: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST /simulation/contract/validate
  fastify.post('/contract/validate', async (request, reply) => {
    try {
      if (!registry) {
        return reply.status(503).send({ success: false, error: "Contract not initialized. Check MAX_REGISTRY environment variable." });
      }
      const { agentId, sectorId, action, amount } = request.body;
      const valid = await registry.read.validateAction([agentId, sectorId, action, amount]);
      reply.send({ success: true, valid });
    } catch (error) {
      log(`Error validating action: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });

  // GET /simulation/contract/events
  fastify.get('/contract/events', async (request, reply) => {
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
      let sectorId = 1;
      const maxIterations = 1000;
      let iterations = 0;

      while (iterations < maxIterations) {
        try {
          const sector = await registry.read.sectors([sectorId]);
          if (sector && sector.id && BigInt(sector.id) !== 0n) {
            events.push({
              type: "sector",
              actor: sector.creator,
              timestamp: null,
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
            break;
          }
        } catch (error) {
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
              timestamp: null,
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

      // Read trades
      let tradeId = 1;
      iterations = 0;
      while (iterations < maxIterations) {
        try {
          const trade = await registry.read.trades([tradeId]);
          if (trade && trade.id && BigInt(trade.id) !== 0n) {
            events.push({
              type: "trade",
              actor: null,
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

      // Sort events by timestamp
      events.sort((a, b) => {
        if (a.timestamp === null && b.timestamp === null) return 0;
        if (a.timestamp === null) return 1;
        if (b.timestamp === null) return -1;
        return b.timestamp - a.timestamp;
      });

      reply.send({ 
        success: true, 
        events,
        counts
      });
    } catch (error) {
      log(`Error fetching contract events: ${error.message}`);
      reply.status(500).send({ success: false, error: error.message });
    }
  });
};

