const { loadDiscussions } = require('../utils/discussionStorage');
const { getAllSectors, getSectorById } = require('../utils/sectorStorage');
const { loadAgents } = require('../utils/agentStorage');
const DiscussionRoom = require('../models/DiscussionRoom');
const { readDataFile, writeDataFile } = require('../utils/persistence');

const EXECUTION_LOGS_FILE = 'executionLogs.json';

// Simple logger
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

module.exports = async (fastify) => {
  // GET /api/decision-logs/finalized-rejections
  // Returns ONLY checklist items where:
  // - managerDecision = 'rejected' (approved === false)
  // - workerResponse = 'accepted_rejection' (status === 'ACCEPT_REJECTION')
  fastify.get('/finalized-rejections', async (request, reply) => {
    try {
      const { sector, managerId, timeRange, discussionId } = request.query;
      
      log(`GET /api/decision-logs/finalized-rejections - Fetching finalized rejections with filters: sector=${sector}, managerId=${managerId}, timeRange=${timeRange}, discussionId=${discussionId}`);

      // Load all discussions
      const allDiscussions = await loadDiscussions();
      
      // Load sectors for sector symbol lookup
      const sectors = await getAllSectors();
      const sectorMap = new Map();
      sectors.forEach(s => {
        if (s && s.id) {
          sectorMap.set(s.id, {
            symbol: s.symbol || s.sectorSymbol || 'N/A',
            name: s.name || s.sectorName || 'Unknown Sector'
          });
        }
      });

      // Load agents for manager lookup
      const agents = await loadAgents();
      const managerMap = new Map(); // sectorId -> managerId
      agents.forEach(agent => {
        if (agent && (agent.role === 'manager' || agent.role?.toLowerCase().includes('manager')) && agent.sectorId) {
          managerMap.set(agent.sectorId, agent.id);
        }
      });

      // Collect all finalized rejections
      const finalizedRejections = [];

      for (const discussionData of allDiscussions) {
        // Filter by discussionId if provided
        if (discussionId && discussionData.id !== discussionId) {
          continue;
        }

        const discussionRoom = DiscussionRoom.fromData(discussionData);
        const managerDecisions = Array.isArray(discussionRoom.managerDecisions) ? discussionRoom.managerDecisions : [];
        const checklist = Array.isArray(discussionRoom.checklist) ? discussionRoom.checklist : [];

        // Get sector info
        const sectorInfo = discussionRoom.sectorId ? sectorMap.get(discussionRoom.sectorId) : null;
        const sectorSymbol = sectorInfo?.symbol || 'N/A';

        // Filter by sector if provided (match by symbol or id)
        if (sector) {
          const matchesSymbol = sectorSymbol === sector;
          const matchesId = discussionRoom.sectorId === sector;
          if (!matchesSymbol && !matchesId) {
            continue;
          }
        }

        // Get managerId for this discussion's sector
        const discussionManagerId = discussionRoom.sectorId ? managerMap.get(discussionRoom.sectorId) : null;

        // Filter by managerId if provided
        if (managerId && discussionManagerId !== managerId) {
          continue;
        }

        // Find rejected items: managerDecision.approved === false
        // Include both ACCEPT_REJECTION (finalized) and REVISE_REQUIRED (pending worker response)
        for (const decision of managerDecisions) {
          // Check if decision is rejected
          if (decision.approved !== false) {
            continue;
          }

          // Find the corresponding item in checklist
          const item = decision.item ? checklist.find(i => i.id === decision.item.id) : null;
          
          // If item not found in checklist, use the item from decision
          const actualItem = item || decision.item;

          if (!actualItem) {
            continue;
          }

          // Include rejected items regardless of status (ACCEPT_REJECTION, REVISE_REQUIRED, etc.)
          const itemStatus = actualItem.status || '';
          
          // Skip if item was resubmitted (worker revised it, waiting for re-evaluation)
          if (itemStatus === 'RESUBMITTED' || itemStatus === 'resubmitted') {
            continue;
          }

          // This is a rejection - collect it
          // Determine rejectedAt timestamp
          let rejectedAt = null;
          if (itemStatus === 'ACCEPT_REJECTION' || itemStatus === 'accept_rejection') {
            // For finalized rejections, use discussion's updatedAt as it reflects when status changed to ACCEPT_REJECTION
            if (discussionRoom.updatedAt) {
              rejectedAt = new Date(discussionRoom.updatedAt).toISOString();
            } else if (actualItem.revisedAt) {
              rejectedAt = new Date(actualItem.revisedAt).toISOString();
            } else {
              rejectedAt = new Date(discussionRoom.createdAt).toISOString();
            }
          } else {
            // For pending rejections (REVISE_REQUIRED), use when the manager made the decision
            if (discussionRoom.updatedAt) {
              rejectedAt = new Date(discussionRoom.updatedAt).toISOString();
            } else {
              rejectedAt = new Date(discussionRoom.createdAt).toISOString();
            }
          }

          // Filter by timeRange if provided
          if (timeRange) {
            const rejectedAtTime = new Date(rejectedAt).getTime();
            const now = Date.now();
            let rangeStart = 0;
            
            // Parse timeRange (e.g., "7d", "30d", "1h", "24h")
            const timeRangeMatch = timeRange.match(/^(\d+)([dhms])$/);
            if (timeRangeMatch) {
              const value = parseInt(timeRangeMatch[1], 10);
              const unit = timeRangeMatch[2];
              const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
              rangeStart = now - (value * multipliers[unit]);
            } else {
              // Try to parse as ISO date string
              try {
                rangeStart = new Date(timeRange).getTime();
              } catch (e) {
                log(`Invalid timeRange format: ${timeRange}`);
              }
            }
            
            if (rejectedAtTime < rangeStart) {
              continue;
            }
          }

          // Create itemContent summary
          const itemContent = {
            action: actualItem.action || null,
            amount: actualItem.amount || null,
            reason: actualItem.reason || actualItem.reasoning || actualItem.text || actualItem.description || '',
            confidence: actualItem.confidence || null
          };

          // Transform to frontend format
          finalizedRejections.push({
            id: actualItem.id || `rejected-${discussionRoom.id}-${Date.now()}`,
            timestamp: new Date(rejectedAt).getTime(),
            sectorSymbol: sectorSymbol,
            discussionId: discussionRoom.id,
            discussionTitle: discussionRoom.title || 'Untitled Discussion',
            managerId: discussionManagerId,
            action: itemContent.action || 'N/A',
            amount: itemContent.amount || null,
            confidence: itemContent.confidence || null,
            managerReason: decision.reason || actualItem.managerReason || null,
            text: itemContent.reason || '',
            status: itemStatus, // Include status to distinguish between ACCEPT_REJECTION and REVISE_REQUIRED
            isFinalized: itemStatus === 'ACCEPT_REJECTION' || itemStatus === 'accept_rejection',
            revisionCount: actualItem.revisionCount || 0
          });
        }
      }

      // Sort by rejectedAt (newest → oldest)
      finalizedRejections.sort((a, b) => {
        const timeA = new Date(a.rejectedAt).getTime();
        const timeB = new Date(b.rejectedAt).getTime();
        return timeB - timeA; // Descending order (newest first)
      });

      log(`Found ${finalizedRejections.length} finalized rejections`);

      return reply.status(200).send({
        success: true,
        finalizedRejections: finalizedRejections,
        count: finalizedRejections.length
      });
    } catch (error) {
      log(`Error fetching finalized rejections: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Extract discussion ID from checklist ID
   * Checklist IDs are in format: checklist-{discussionId}-{index}
   */
  function extractDiscussionId(checklistId) {
    if (!checklistId || typeof checklistId !== 'string') {
      return null;
    }
    
    const match = checklistId.match(/^checklist-(.+?)-(\d+)$/);
    if (match && match[1]) {
      return match[1];
    }
    
    return null;
  }

  /**
   * Parse time range filter
   * Format: "startTimestamp:endTimestamp" or "lastNhours" or "lastNdays"
   */
  function parseTimeRange(timeRange) {
    if (!timeRange) {
      return null;
    }

    const now = Date.now();

    // Check for "lastNhours" or "lastNdays" format
    const lastHoursMatch = timeRange.match(/^last(\d+)hours?$/i);
    if (lastHoursMatch) {
      const hours = parseInt(lastHoursMatch[1], 10);
      return { start: now - (hours * 60 * 60 * 1000), end: now };
    }

    const lastDaysMatch = timeRange.match(/^last(\d+)days?$/i);
    if (lastDaysMatch) {
      const days = parseInt(lastDaysMatch[1], 10);
      return { start: now - (days * 24 * 60 * 60 * 1000), end: now };
    }

    // Check for "start:end" format
    const parts = timeRange.split(':');
    if (parts.length === 2) {
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      if (!isNaN(start) && !isNaN(end)) {
        return { start, end };
      }
    }

    return null;
  }

  /**
   * Transform execution log entry to decision log format (frontend format)
   */
  async function transformToDecisionLog(logEntry, result) {
    const executionId = logEntry.id;
    const sectorId = logEntry.sectorId;
    const timestamp = logEntry.timestamp || Date.now();
    
    // Extract discussion ID from checklistId
    const discussionId = logEntry.checklistId 
      ? extractDiscussionId(logEntry.checklistId)
      : null;
    
    // Get action type from result
    const actionType = (result.actionType || result.action || '').toUpperCase();
    
    // Get performance impact (managerImpact)
    const performanceImpact = typeof result.managerImpact === 'number' 
      ? result.managerImpact 
      : null;
    
    // Transform to frontend format: { id, timestamp, sectorId, checklistId, action, impact, results }
    return {
      id: executionId,
      timestamp: timestamp,
      sectorId: sectorId,
      checklistId: discussionId, // Use discussionId as checklistId for frontend
      action: actionType,
      impact: performanceImpact || 0,
      results: [{
        itemId: result.itemId || executionId,
        action: actionType,
        actionType: actionType,
        amount: typeof result.amount === 'number' ? result.amount : (typeof result.allocation === 'number' ? result.allocation : 0),
        allocation: typeof result.allocation === 'number' ? result.allocation : undefined,
        symbol: result.symbol || sectorId,
        success: result.success !== false, // Default to true if not specified
        reason: result.reason || null,
        impact: performanceImpact || null,
        managerImpact: performanceImpact || null
      }]
    };
  }

  /**
   * GET /api/decision-logs/executed
   * 
   * Get all executed checklist items from execution logs.
   * 
   * Query params:
   *   sector: string (optional) - Filter by sector ID
   *   managerId: string (optional) - Filter by manager ID
   *   timeRange: string (optional) - Filter by time range (format: "start:end" or "lastNhours" or "lastNdays")
   *   discussionId: string (optional) - Filter by discussion ID
   *   actionType: string (optional) - Filter by action type (BUY, SELL, HOLD, REBALANCE)
   * 
   * Output:
   *   {
   *     success: boolean,
   *     logs: Array<{
   *       executionId: string,
   *       discussionId: string | null,
   *       sector: string,
   *       managerId: string | null,
   *       actionType: string,
   *       symbol: string,
   *       allocation?: number,
   *       quantity?: number,
   *       executionPrice: number | null,
   *       performanceImpact: number | null,
   *       executedAt: number
   *     }>
   *   }
   */
  fastify.get('/executed', async (request, reply) => {
    try {
      const { sector, managerId, timeRange, discussionId, actionType } = request.query;

      log(`GET /api/decision-logs/executed - Fetching executed decision logs with filters: sector=${sector}, managerId=${managerId}, timeRange=${timeRange}, discussionId=${discussionId}, actionType=${actionType}`);

      // Read execution logs
      let allLogs = [];
      try {
        const data = await readDataFile(EXECUTION_LOGS_FILE);
        allLogs = Array.isArray(data) ? data : [];
      } catch (error) {
        if (error.code === 'ENOENT') {
          // File doesn't exist yet, return empty array
          return reply.status(200).send({
            success: true,
            logs: []
          });
        }
        throw error;
      }

      // Parse time range filter
      const timeFilter = parseTimeRange(timeRange);

      // Transform and filter logs
      const decisionLogs = [];
      
      for (const logEntry of allLogs) {
        // Filter by sector
        if (sector && logEntry.sectorId !== sector) {
          continue;
        }

        // Filter by manager ID
        if (managerId && logEntry.managerId !== managerId) {
          continue;
        }

        // Filter by time range
        if (timeFilter) {
          const logTimestamp = logEntry.timestamp || 0;
          if (logTimestamp < timeFilter.start || logTimestamp > timeFilter.end) {
            continue;
          }
        }

        // Process results array
        const results = Array.isArray(logEntry.results) ? logEntry.results : [];
        
        for (const result of results) {
          // Only include successful executions
          if (!result.success) {
            continue;
          }

          // Extract discussion ID from checklistId for filtering
          const resultDiscussionId = logEntry.checklistId 
            ? extractDiscussionId(logEntry.checklistId)
            : null;

          // Filter by discussion ID
          if (discussionId && resultDiscussionId !== discussionId) {
            continue;
          }

          // Filter by action type
          const resultActionType = (result.actionType || result.action || '').toUpperCase();
          if (actionType && resultActionType !== actionType.toUpperCase()) {
            continue;
          }

          // Transform to decision log format
          const decisionLog = await transformToDecisionLog(logEntry, result);
          decisionLogs.push(decisionLog);
        }
      }

      // Also include approved items from managerDecisions (even if not executed yet)
      const allDiscussions = await loadDiscussions();
      const sectors = await getAllSectors();
      const sectorMap = new Map();
      sectors.forEach(s => {
        if (s && s.id) {
          sectorMap.set(s.id, {
            symbol: s.symbol || s.sectorSymbol || 'N/A',
            name: s.name || s.sectorName || 'Unknown Sector'
          });
        }
      });

      const agents = await loadAgents();
      const managerMap = new Map(); // sectorId -> managerId
      agents.forEach(agent => {
        if (agent && (agent.role === 'manager' || agent.role?.toLowerCase().includes('manager')) && agent.sectorId) {
          managerMap.set(agent.sectorId, agent.id);
        }
      });

      for (const discussionData of allDiscussions) {
        // Filter by discussionId if provided
        if (discussionId && discussionData.id !== discussionId) {
          continue;
        }

        const discussionRoom = DiscussionRoom.fromData(discussionData);
        const managerDecisions = Array.isArray(discussionRoom.managerDecisions) ? discussionRoom.managerDecisions : [];

        // Get sector info
        const sectorInfo = discussionRoom.sectorId ? sectorMap.get(discussionRoom.sectorId) : null;
        const sectorSymbol = sectorInfo?.symbol || 'N/A';

        // Filter by sector if provided
        if (sector) {
          const matchesSymbol = sectorSymbol === sector;
          const matchesId = discussionRoom.sectorId === sector;
          if (!matchesSymbol && !matchesId) {
            continue;
          }
        }

        // Get managerId for this discussion's sector
        const discussionManagerId = discussionRoom.sectorId ? managerMap.get(discussionRoom.sectorId) : null;

        // Filter by managerId if provided
        if (managerId && discussionManagerId !== managerId) {
          continue;
        }

        // Find approved items
        for (const decision of managerDecisions) {
          if (decision.approved !== true || !decision.item) {
            continue;
          }

          const item = decision.item;
          const itemStatus = item.status || '';
          
          // Only include APPROVED items (not yet executed)
          if (itemStatus !== 'APPROVED' && itemStatus !== 'approved') {
            continue;
          }

          // Filter by action type if provided
          const itemAction = (item.action || '').toUpperCase();
          if (actionType && itemAction !== actionType.toUpperCase()) {
            continue;
          }

          // Get decision timestamp (when manager made the decision)
          let decisionTimestamp = Date.now();
          if (discussionRoom.updatedAt) {
            decisionTimestamp = new Date(discussionRoom.updatedAt).getTime();
          } else if (discussionRoom.createdAt) {
            decisionTimestamp = new Date(discussionRoom.createdAt).getTime();
          }

          // Filter by time range
          if (timeFilter) {
            if (decisionTimestamp < timeFilter.start || decisionTimestamp > timeFilter.end) {
              continue;
            }
          }

          // Create decision log entry for approved item (frontend format)
          const approvedDecisionLog = {
            id: `approved-${discussionRoom.id}-${item.id}`,
            timestamp: decisionTimestamp,
            sectorId: discussionRoom.sectorId,
            checklistId: discussionRoom.id, // Use discussionId as checklistId for frontend
            action: itemAction || 'HOLD',
            impact: 0, // Not executed yet, so no impact
            results: [{
              itemId: item.id,
              action: itemAction || 'HOLD',
              actionType: itemAction || 'HOLD',
              amount: typeof item.amount === 'number' ? item.amount : 0,
              allocation: typeof item.amount === 'number' ? item.amount : undefined,
              symbol: sectorSymbol,
              success: true, // Approved items are considered successful
              reason: decision.reason || null,
              impact: null,
              managerImpact: null
            }],
            status: 'APPROVED', // Indicates approved but not yet executed
            score: decision.score || null,
            managerReason: decision.reason || null
          };

          decisionLogs.push(approvedDecisionLog);
        }
      }

      // Sort by timestamp descending (newest first)
      decisionLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      log(`Found ${decisionLogs.length} executed decision logs (including ${decisionLogs.filter(l => l.status === 'APPROVED').length} approved but not yet executed)`);

      return reply.status(200).send({
        success: true,
        logs: decisionLogs
      });
    } catch (error) {
      log(`Error fetching executed decision logs: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });

  // DELETE /api/decision-logs/clear
  // Clear all decision log entries from executionLogs.json
  fastify.delete('/clear', async (request, reply) => {
    try {
      log('DELETE /api/decision-logs/clear - Clearing all decision logs');

      // Clear execution logs file
      await writeDataFile(EXECUTION_LOGS_FILE, []);

      log('Cleared all decision logs');

      return reply.status(200).send({
        success: true
      });
    } catch (error) {
      log(`Error clearing decision logs: ${error.message}`);
      return reply.status(500).send({
        success: false,
        error: error.message
      });
    }
  });
};
