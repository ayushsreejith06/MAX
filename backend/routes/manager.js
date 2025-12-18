/**
 * Manager Routes
 * 
 * API endpoints for manager decision-making subsystem
 */

const ManagerAgent = require('../agents/manager/ManagerAgent');
const ExecutionAgent = require('../agents/ExecutionAgent');
const { loadAgents } = require('../utils/agentStorage');
const { getAgentRuntime } = require('../agents/runtime/agentRuntime');
const ExecutionEngine = require('../core/ExecutionEngine');
const { getExecutionList } = require('../utils/executionListStorage');
const { 
  getExecutionList, 
  clearExecutionList, 
  removeExecutionItem,
  getManagerBySectorId,
  getManagerById
} = require('../utils/executionListStorage');
const { requireManager } = require('../utils/managerAuth');

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
            // Generate a temporary ID and name since ManagerAgent requires these
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

  /**
   * GET /api/manager/execution-list/:managerId
   * 
   * Get execution list for a manager
   * 
   * Output:
   *   {
   *     success: boolean,
   *     data: Array<executionItem>
   *   }
   */
  fastify.get('/execution-list/:managerId', async (request, reply) => {
    try {
      const { managerId } = request.params;
      const executionList = await getExecutionList(managerId);
      
      return reply.status(200).send({
        success: true,
        data: executionList
      });
    } catch (error) {
      log(`Error in /api/manager/execution-list/:managerId: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/manager/execution-list-by-sector/:sectorId
   * 
   * Get execution list for a manager by sector ID
   * 
   * Output:
   *   {
   *     success: boolean,
   *     data: Array<executionItem>
   *   }
   */
  fastify.get('/execution-list-by-sector/:sectorId', async (request, reply) => {
    try {
      const { sectorId } = request.params;
      const manager = await getManagerBySectorId(sectorId);
      
      if (!manager) {
        return reply.status(404).send({
          success: false,
          error: `Manager not found for sector ${sectorId}`
        });
      }

      const executionList = await getExecutionList(manager.id);
      
      return reply.status(200).send({
        success: true,
        data: executionList,
        managerId: manager.id
      });
    } catch (error) {
      log(`Error in /api/manager/execution-list-by-sector/:sectorId: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/manager/execution-list/:managerId
   * 
   * Clear execution list for a manager
   * 
   * Output:
   *   {
   *     success: boolean,
   *     message: string
   *   }
   */
  fastify.delete('/execution-list/:managerId', async (request, reply) => {
    try {
      const { managerId } = request.params;
      await clearExecutionList(managerId);
      
      return reply.status(200).send({
        success: true,
        message: `Execution list cleared for manager ${managerId}`
      });
    } catch (error) {
      log(`Error in DELETE /api/manager/execution-list/:managerId: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * DELETE /api/manager/execution-list/:managerId/item/:itemId
   * 
   * Remove a specific execution item from a manager's execution list
   * 
   * Output:
   *   {
   *     success: boolean,
   *     message: string
   *   }
   */
  fastify.delete('/execution-list/:managerId/item/:itemId', async (request, reply) => {
    try {
      const { managerId, itemId } = request.params;
      const removed = await removeExecutionItem(managerId, itemId);
      
      if (!removed) {
        return reply.status(404).send({
          success: false,
          error: `Execution item ${itemId} not found in manager ${managerId}'s execution list`
        });
      }
      
      return reply.status(200).send({
        success: true,
        message: `Execution item ${itemId} removed from manager ${managerId}'s execution list`
      });
    } catch (error) {
      log(`Error in DELETE /api/manager/execution-list/:managerId/item/:itemId: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/manager/:id/execution-list
   * 
   * Get execution list for a manager.
   * 
   * Output:
   *   {
   *     success: boolean,
   *     executionList: Array<Object>
   *   }
   */
  fastify.get('/:id/execution-list', async (request, reply) => {
    try {
      const { id } = request.params;

      if (!id) {
        return reply.status(400).send({
          success: false,
          error: 'Manager ID is required'
        });
      }

      log(`GET /api/manager/${id}/execution-list`);

      const executionList = await getExecutionList(id);

      return reply.status(200).send({
        success: true,
        executionList: executionList
      });
    } catch (error) {
      log(`Error in /api/manager/:id/execution-list: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/manager/:id/execute-all
   * 
   * Execute all items in the manager's execution list.
   * 
   * Output:
   *   {
   *     success: boolean,
   *     executed: number,
   *     total: number,
   *     results: Array<Object>,
   *     updatedSectorState?: Object
   *   }
   */
  fastify.post('/:id/execute-all', async (request, reply) => {
    try {
      const { id } = request.params;

      if (!id) {
        return reply.status(400).send({
          success: false,
          error: 'Manager ID is required'
        });
      }

      // ENFORCEMENT: Verify that the ID belongs to a manager
      try {
        await requireManager(id, 'all', 'EXECUTE_ALL', `POST /api/manager/${id}/execute-all`);
      } catch (authError) {
        return reply.status(403).send({
          success: false,
          error: authError.message
        });
      }

      log(`POST /api/manager/${id}/execute-all`);

      const executionEngine = new ExecutionEngine();
      const result = await executionEngine.processExecutionList(id);

      log(`Execution completed: ${result.executed}/${result.total} items executed`);

      return reply.status(200).send({
        success: result.success,
        executed: result.executed,
        total: result.total,
        results: result.results,
        updatedSectorState: result.updatedSectorState
      });
    } catch (error) {
      log(`Error in /api/manager/:id/execute-all: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};

