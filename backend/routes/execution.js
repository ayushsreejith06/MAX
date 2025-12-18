/**
 * Execution routes - Handle trade execution requests
 */

const ExecutionAgent = require('../agents/ExecutionAgent');
const ExecutionLog = require('../models/ExecutionLog');
const { captureConfidenceSnapshot, calculateConfidenceMultiplier, applyConfidenceMultiplier } = require('../utils/confidenceMultiplier');
const { loadAgents } = require('../utils/agentStorage');
const { requireManager } = require('../utils/managerAuth');

function log(message) {
  console.log(`[Execution] ${message}`);
}

module.exports = async (fastify) => {
  /**
   * POST /api/execution/execute
   * 
   * Executes a final decision from ManagerAgent.
   * 
   * Input:
   *   {
   *     sectorId: string (required),
   *     decision: {
   *       action: string (BUY | SELL | HOLD | NEEDS_REVIEW),
   *       confidence: number (0-1),
   *       reason: string,
   *       riskScore?: number (optional)
   *     },
   *     options?: {
   *       quantity?: number (optional, calculated from confidence if not provided),
   *       agentId?: string (optional, defaults to 'manager'),
   *       price?: number (optional, for limit orders),
   *       type?: string ('market' | 'limit', default: 'market'),
   *       leverage?: number (optional, default: 1.0)
   *     }
   *   }
   * 
   * Output:
   *   {
   *     success: boolean,
   *     status: string (EXECUTED | REJECTED | ERROR),
   *     executionId: string,
   *     timestamp: number,
   *     reason?: string (if rejected),
   *     executionResult?: object (if executed)
   *   }
   */
  fastify.post('/execute', async (request, reply) => {
    try {
      const { sectorId, decision, options = {}, agentId } = request.body;

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

      // ENFORCEMENT: Only managers can trigger execution
      if (agentId) {
        try {
          await requireManager(agentId, decision.executionId || 'unknown', 'EXECUTE', 'POST /api/execution/execute');
        } catch (authError) {
          return reply.status(403).send({
            success: false,
            error: authError.message
          });
        }
      } else {
        // If no agentId provided, we should still check if this is a manager-initiated request
        // For now, we'll allow it but log a warning
        console.warn('[Execution] POST /api/execution/execute called without agentId - cannot verify manager authority');
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

  /**
   * GET /api/execution/logs/:sectorId
   * 
   * Get execution logs for a sector.
   * 
   * Query params:
   *   limit?: number (default: 100, max: 1000)
   * 
   * Output:
   *   {
   *     success: boolean,
   *     logs: Array<Object>
   *   }
   */
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

  /**
   * POST /api/execution/log
   * 
   * Log an execution item with action and price change impact.
   * 
   * Input:
   *   {
   *     sectorId: string (required),
   *     action: string (required),
   *     impact: number (required) - price change impact
   *   }
   * 
   * Output:
   *   {
   *     success: boolean,
   *     log: ExecutionLog object
   *   }
   */
  fastify.post('/log', async (request, reply) => {
    try {
      const { sectorId, action, impact } = request.body;

      // Validate input
      if (!sectorId) {
        return reply.status(400).send({
          success: false,
          error: 'sectorId is required'
        });
      }

      if (!action) {
        return reply.status(400).send({
          success: false,
          error: 'action is required'
        });
      }

      if (typeof impact !== 'number') {
        return reply.status(400).send({
          success: false,
          error: 'impact is required and must be a number'
        });
      }

      log(`Logging execution for sector ${sectorId}: ${action} (impact: ${impact})`);

      // Optionally capture confidence snapshot if agents are available
      let confidenceSnapshot = null;
      let confidenceMultiplier = null;
      let adjustedImpact = impact;
      
      try {
        const allAgents = await loadAgents();
        const sectorAgents = allAgents.filter(agent => agent && agent.sectorId === sectorId);
        
        if (sectorAgents.length > 0) {
          confidenceSnapshot = captureConfidenceSnapshot(sectorAgents, null);
          confidenceMultiplier = calculateConfidenceMultiplier(confidenceSnapshot, action);
          adjustedImpact = applyConfidenceMultiplier(impact, confidenceMultiplier);
        }
      } catch (error) {
        // Don't fail if confidence capture fails - this is optional
        console.warn(`[Execution] Failed to capture confidence snapshot: ${error.message}`);
      }

      // Create and save execution log
      const executionLog = new ExecutionLog({
        sectorId,
        action,
        impact: adjustedImpact, // Use adjusted impact if confidence multiplier was applied
        timestamp: Date.now(),
        confidenceSnapshot: confidenceSnapshot,
        confidenceMultiplier: confidenceMultiplier
      });

      await executionLog.save();

      return reply.status(200).send({
        success: true,
        log: executionLog.toJSON()
      });
    } catch (error) {
      log(`Error logging execution: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

};

