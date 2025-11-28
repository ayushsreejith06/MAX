/**
 * Manager Routes
 * 
 * API endpoints for manager decision-making subsystem
 */

const ManagerAgent = require('../agents/ManagerAgent');
const ExecutionAgent = require('../agents/ExecutionAgent');
const { loadAgents } = require('../utils/agentStorage');
const { getAgentRuntime } = require('../agents/runtime/agentRuntime');

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  /**
   * POST /api/manager/decide
   * 
   * Makes a decision based on agent signals for a sector.
   * 
   * Input:
   *   {
   *     sectorId: string (required),
   *     signals?: Array<{action: string, confidence: number, agentId?: string}> (optional),
   *     conflictThreshold?: number (optional, 0-1),
   *     autoExecute?: boolean (optional, default: false) - If true, automatically execute the decision
   *     executionOptions?: Object (optional) - Options for execution if autoExecute is true
   *   }
   * 
   * If signals are not provided, the endpoint will attempt to generate mock signals
   * from sector agents for testing purposes.
   * 
   * Output:
   *   {
   *     success: boolean,
   *     data: {
   *       action: string (BUY | SELL | HOLD | NEEDS_REVIEW),
   *       confidence: number (0-1),
   *       reason: string,
   *       voteBreakdown?: {BUY: number, SELL: number, HOLD: number},
   *       conflictScore?: number,
   *       suggestedAction?: string (if action is NEEDS_REVIEW)
   *     }
   *   }
   */
  fastify.post('/decide', async (request, reply) => {
    try {
      const { sectorId, signals, conflictThreshold } = request.body;

      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required'
        });
      }

      log(`POST /api/manager/decide - Processing decision for sector ${sectorId}`);

      // Create manager agent instance
      const manager = new ManagerAgent(sectorId);

      // Set conflict threshold if provided
      if (typeof conflictThreshold === 'number') {
        manager.setConflictThreshold(conflictThreshold);
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
          // In production, these would come from actual agent decision-making processes
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
      const { autoExecute, executionOptions = {} } = request.body;
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
      log(`Error in /api/manager/decide: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/manager/status
   * 
   * Returns the status of the agent runtime and all manager agents.
   * 
   * Output:
   *   {
   *     success: boolean,
   *     data: {
   *       isRunning: boolean,
   *       managerCount: number,
   *       tickIntervalMs: number,
   *       decisionLogSize: number,
   *       managers: Array<{id, sectorId, name, lastDecision, decisionCount}>
   *     }
   *   }
   */
  fastify.get('/status', async (request, reply) => {
    try {
      const agentRuntime = getAgentRuntime();
      const status = agentRuntime.getStatus();
      
      return reply.status(200).send({
        success: true,
        data: status
      });
    } catch (error) {
      log(`Error in /api/manager/status: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/manager/decisions/:sectorId
   * 
   * Returns all decisions made by the manager for a specific sector.
   * 
   * Output:
   *   {
   *     success: boolean,
   *     data: Array<{managerId, sectorId, decision, timestamp}>
   *   }
   */
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
      log(`Error in /api/manager/decisions/:sectorId: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};

